# Advanced queries

::: tip postgrelize extensions
Sections marked <Ext /> describe options, methods and statements that Sequelize v6 does not have. Everything else here behaves as in v6. All extensions are listed on the [extensions page](/extensions/).
:::

In Sequelize v6, subqueries, CTEs and window functions need `literal()` SQL strings. postgrelize builds them from the same find options you already use, with bound parameters and quoted identifiers, and returns model instances where that makes sense.

The examples use `User` (`name`), `Post` (`title`, `rank`, `published`, `UserId`; `User.hasMany(Post)`) and `Category` (`name`, `parentId`), a tree.

## Subqueries <Ext />

`Model.subquery(findOptions)` builds a `SELECT` that can be embedded in another query instead of running it. It accepts the find options (`attributes`, `where`, `order`, `limit`, `include`, scopes) plus `as` for the table alias, which defaults to the model name. The default scope and the paranoid filter apply.

Use it with `Op.in` / `Op.notIn`, as a scalar value in `attributes`, as a `from` / `using` source, and as the source of [`insertFrom`](./bulk-writes#insert-select) and [`merge`](./bulk-writes#merge):

<<< @/examples/advanced-queries.ts#subquery{ts}

A subquery can reference the outer query with `col('User.id')` (a correlated subquery). Its parameters are numbered together with the outer statement.

## `EXISTS` <Ext />

`exists(subquery)` and `notExists(subquery)` produce `EXISTS (...)` conditions. Use them as the `where` value or inside `Op.and` / `Op.or`:

<<< @/examples/advanced-queries.ts#exists{ts}

## `DISTINCT ON` <Ext />

`distinctOn` keeps the first row of each group, as defined by `order`. It is the idiomatic PostgreSQL way to get "the latest / best row per key":

<<< @/examples/advanced-queries.ts#distinct-on{ts}

As PostgreSQL requires, the `order` must start with the `distinctOn` expressions.

## Window functions <Ext />

`over(fn, { partitionBy, orderBy })` adds an `OVER (...)` clause to a function call. Use it in `attributes` (and, through a subquery or CTE, in filters):

<<< @/examples/advanced-queries.ts#window{ts}

`orderBy` uses the same format and the same direction allow-list as `order`.

## Aggregate `FILTER` <Ext />

`filter(aggregate, where)` writes `aggregate FILTER (WHERE …)`, so one query can count or sum different subsets of the rows. Use it in `attributes`, `having`, `order` and `where(...)`; wrap it in `over()` for a window aggregate. Supported by every PostgreSQL version postgrelize supports.

The condition is an ordinary `where`: attribute names resolve to the queried model, values are bound, `Op.*`, `col()` and `exists()` work. Write `COUNT(*)` as `fn('count', col('*'))` and `COUNT(DISTINCT x)` as `fn('count', fn('distinct', col('x')))`. `count` and integer `sum` are `bigint`, which reads back as a string.

<<< @/examples/advanced-queries.ts#filter{ts}

## Row comparison and keyset pagination <Ext />

`tuple(...)` builds a row value `(a, b)`. Combined with `where(left, operator, right)`, it expresses keyset ("seek") pagination, which stays fast on deep pages where `OFFSET` does not:

<<< @/examples/advanced-queries.ts#keyset{ts}

Back the comparison with an index on the same columns in the same order, e.g. `indexes: [{ fields: ['rank', 'id'] }]`.

## Common table expressions <Ext />

The `with` option adds `WITH` clauses to `findAll`, `findOne`, `count`, aggregates and `copyTo`. Each CTE is a subquery, or `{ query, recursive?, unionAll?, materialized? }`.

`source` reads the model rows from a CTE instead of the table, and the result is still model instances. A recursive CTE walks a tree in one query:

<<< @/examples/advanced-queries.ts#recursive-cte{ts}

- `recursive` makes the clause `WITH RECURSIVE` and is joined to `query` with `UNION ALL` (`unionAll: false` for `UNION`).
- Inside the recursive part, `from: { tree: 'tree' }` adds the CTE as an extra relation, so `col('tree.id')` can reference it.
- `materialized: true` / `false` adds `MATERIALIZED` / `NOT MATERIALIZED`.

CTEs can also be used as filters:

<<< @/examples/advanced-queries.ts#cte{ts}

### `SEARCH` and `CYCLE` <Ext />

A recursive CTE definition accepts `search` and `cycle`:

- `search: { by, mode?, set }` adds a column `set` that orders the rows depth first (`mode: 'depth'`, the default) or breadth first (`'breadth'`) by the `by` columns. Order the result by it.
- `cycle: { columns, set, using }` adds a boolean column `set` that is true on the row that revisits the same `columns`, and an array column `using` with the path. The recursion stops at such a row, so cyclic data cannot loop forever.

Both need `recursive`. The added columns are not model attributes: select them with `[col('walk'), 'walk']` (or read `raw` rows).

<<< @/examples/advanced-queries.ts#cte-search{ts}

<<< @/examples/advanced-queries.ts#cte-cycle{ts}

### Data-modifying CTEs <Ext />

`Model.updateStatement(values, { where, returning })`, `Model.deleteStatement({ where, returning })` and `Model.insertStatement(rows, { returning })` build a statement for the `with` option. The statement runs as part of the finder's query. With `returning: true`, read its rows through `source: '<cte name>'`, or filter with them. No hooks or validation run; `updatedAt` is set (not with `silent: true`), defaults and timestamps are filled for inserts, and `deleteStatement` is a real delete, also for paranoid models.

<<< @/examples/advanced-queries.ts#data-modifying-cte{ts}

- The query is sent to the writer, never to a read replica.
- A data-modifying statement cannot be `recursive`, and cannot be the main statement of a finder: only the CTE body is supported (for example, there is no `INSERT … SELECT FROM cte`).
- All CTEs of one statement see the same snapshot: the main query does not see the changes of a data-modifying CTE in the tables, only in its `RETURNING` rows.

## Set operations <Ext />

`Subquery` has `union()`, `intersect()` and `except()` (pass `{ all: true }` for the `ALL` forms). The result is another subquery, so it works wherever a subquery does: in `Op.in`, in `with`, as a source of `insertFrom` or `merge`. Both sides must select the same columns.

<<< @/examples/advanced-queries.ts#set-operations{ts}

`source` also accepts a subquery: the finder then reads model rows from `(… UNION …) AS "User"`, and its own `order`, `limit` and `offset` apply to the combined result. Select all attributes in the operands for that (no `attributes` option), because the finder selects every attribute of the model.

## `FETCH FIRST … WITH TIES` <Ext />

`withTies: true` with `limit` and `order` returns the first `limit` rows plus every row that ties with the last one on the `order` columns (`FETCH FIRST $1 ROWS WITH TIES`). PostgreSQL rejects it without `ORDER BY`; postgrelize throws `withTies requires a limit` when `limit` is missing.

<<< @/examples/advanced-queries.ts#with-ties{ts}

## Extra relations with `from` <Ext />

`from` on finders adds relations to the `FROM` clause, keyed by alias, without an association. Correlate them in `where`:

```ts
const parents = await Category.findAll({
  attributes: ['name', [fn('count', col('child.id')), 'children']],
  from: { child: Category },
  where: { id: col('child.parentId') },
  group: ['Category.id', 'Category.name'],
  raw: true,
});
```

### VALUES, set-returning functions and `JSON_TABLE` <Ext />

A `from` entry can also be an object that produces rows. Every value is a bound parameter; names are quoted identifiers.

| Entry                                                   | SQL                                                                                    |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `{ values: { columns, rows } }`                         | `(VALUES (…), …) AS "alias"("col", …)`                                                 |
| `{ function, args?, columns?, ordinality? }`            | `fn(args) [WITH ORDINALITY] AS "alias"("col", …)`; `ordinality` names the extra column |
| `{ lateral: subquery }`                                 | `LATERAL (subquery) AS "alias"`                                                        |
| `{ model, sample }`                                     | the model table with `TABLESAMPLE`                                                     |
| `{ jsonTable: { doc, path, columns } }` (PostgreSQL 17) | `JSON_TABLE(doc, path COLUMNS (…)) AS "alias"`                                         |

<<< @/examples/advanced-queries.ts#from-sources{ts}

PostgreSQL cannot always infer the type of a bound parameter in a function call or `VALUES` cell (`generate_series($1, $2)` is ambiguous). Wrap such values in `cast(value, 'integer')`.

`JSON_TABLE` turns a JSON document, given as a value or an expression such as `col('Order.data')`, into rows. The `path` and each column `path` are jsonpath strings, which PostgreSQL only accepts as constants, so they are rendered as escaped string literals. Column `type` is checked against the same list as `'attr::type'` casts. It needs PostgreSQL 17; older servers reject the query. Nested paths (`NESTED PATH`) are not supported.

<<< @/examples/json-table.ts#json-table{ts}

## `LATERAL` joins and top-N per parent <Ext />

A `LATERAL` subquery may reference relations that come before it in `FROM`, so it runs once per row. Use it for "latest N per parent" queries. A lateral entry in `from` behaves like an inner join: rows without a match disappear.

For includes, `lateral: true` on a `separate` include with `limit` makes the database return only the first `limit` rows per parent (`unnest(keys)` joined with a `LATERAL` subquery), instead of loading every child and trimming in memory. `order` applies per parent. It cannot have nested includes.

<<< @/examples/advanced-queries.ts#lateral{ts}

## `TABLESAMPLE` <Ext />

`sample: { method, percent, seed? }` on `findAll` and `count` reads a random part of the table: `BERNOULLI` samples row by row, `SYSTEM` block by block (faster, clustered). `percent` is from 0 to 100; the same `seed` gives the same sample while the data is unchanged (`REPEATABLE`). The same option works on a `from` entry: `{ model, sample }`.

<<< @/examples/advanced-queries.ts#tablesample{ts}

## Server-side cursors with `findEach` <Ext />

`Model.findEach(findOptions, { batchSize })` streams rows with a server-side cursor (`DECLARE ... CURSOR` and `FETCH n`), so a large result is never loaded at once:

<<< @/examples/advanced-queries.ts#find-each{ts}

- The cursor needs a transaction. Pass `transaction`, or `findEach` opens one and commits it when the iteration ends.
- Leaving the loop early (`break`, `return`, an exception) closes the cursor.
- `batchSize` defaults to 100. Includes must be `separate: true`; they are loaded with one extra query per batch. Joined includes are rejected.

For exporting rows as text, [`copyTo`](./bulk-writes#export-with-copyto) is faster still.

## API reference

- [`Model`](/api/classes/Model) — `subquery`, `findEach`
- [`exists`](/api/functions/exists), [`filter`](/api/functions/filter), [`notExists`](/api/functions/notExists), [`over`](/api/functions/over), [`tuple`](/api/functions/tuple), [`where`](/api/variables/where)
- [`CteDefinition`](/api/type-aliases/CteDefinition), [`CteFindOptions`](/api/type-aliases/CteFindOptions), [`WindowOptions`](/api/type-aliases/WindowOptions)
