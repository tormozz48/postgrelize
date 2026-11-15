# Advanced queries

In Sequelize v6, subqueries, CTEs and window functions need `literal()` SQL strings. postgrelize builds them from the same find options you already use, with bound parameters and quoted identifiers, and returns model instances where that makes sense.

The examples use `User` (`name`), `Post` (`title`, `rank`, `published`, `UserId`; `User.hasMany(Post)`) and `Category` (`name`, `parentId`), a tree.

## Subqueries

`Model.subquery(findOptions)` builds a `SELECT` that can be embedded in another query instead of running it. It accepts the find options (`attributes`, `where`, `order`, `limit`, `include`, scopes) plus `as` for the table alias, which defaults to the model name. The default scope and the paranoid filter apply.

Use it with `Op.in` / `Op.notIn`, as a scalar value in `attributes`, as a `from` / `using` source, and as the source of [`insertFrom`](./bulk-writes#insert-select) and [`merge`](./bulk-writes#merge):

<<< @/examples/advanced-queries.ts#subquery{ts}

A subquery can reference the outer query with `col('User.id')` (a correlated subquery). Its parameters are numbered together with the outer statement.

## `EXISTS`

`exists(subquery)` and `notExists(subquery)` produce `EXISTS (...)` conditions. Use them as the `where` value or inside `Op.and` / `Op.or`:

<<< @/examples/advanced-queries.ts#exists{ts}

## `DISTINCT ON`

`distinctOn` keeps the first row of each group, as defined by `order`. It is the idiomatic PostgreSQL way to get "the latest / best row per key":

<<< @/examples/advanced-queries.ts#distinct-on{ts}

As PostgreSQL requires, the `order` must start with the `distinctOn` expressions.

## Window functions

`over(fn, { partitionBy, orderBy })` adds an `OVER (...)` clause to a function call. Use it in `attributes` (and, through a subquery or CTE, in filters):

<<< @/examples/advanced-queries.ts#window{ts}

`orderBy` uses the same format and the same direction allow-list as `order`.

## Row comparison and keyset pagination

`tuple(...)` builds a row value `(a, b)`. Combined with `where(left, operator, right)`, it expresses keyset ("seek") pagination, which stays fast on deep pages where `OFFSET` does not:

<<< @/examples/advanced-queries.ts#keyset{ts}

Back the comparison with an index on the same columns in the same order, e.g. `indexes: [{ fields: ['rank', 'id'] }]`.

## Common table expressions

The `with` option adds `WITH` clauses to `findAll`, `findOne`, `count`, aggregates and `copyTo`. Each CTE is a subquery, or `{ query, recursive?, unionAll?, materialized? }`.

`source` reads the model rows from a CTE instead of the table, and the result is still model instances. A recursive CTE walks a tree in one query:

<<< @/examples/advanced-queries.ts#recursive-cte{ts}

- `recursive` makes the clause `WITH RECURSIVE` and is joined to `query` with `UNION ALL` (`unionAll: false` for `UNION`).
- Inside the recursive part, `from: { tree: 'tree' }` adds the CTE as an extra relation, so `col('tree.id')` can reference it.
- `materialized: true` / `false` adds `MATERIALIZED` / `NOT MATERIALIZED`.

CTEs can also be used as filters:

<<< @/examples/advanced-queries.ts#cte{ts}

Data-modifying CTEs (`WITH x AS (UPDATE ...)`) and the `SEARCH` / `CYCLE` clauses are not supported.

## Set operations

`Subquery` has `union()`, `intersect()` and `except()` (pass `{ all: true }` for the `ALL` forms). The result is another subquery, so it works wherever a subquery does: in `Op.in`, in `with`, as a source of `insertFrom` or `merge`. Both sides must select the same columns.

<<< @/examples/advanced-queries.ts#set-operations{ts}

`source` also accepts a subquery: the finder then reads model rows from `(… UNION …) AS "User"`, and its own `order`, `limit` and `offset` apply to the combined result. Select all attributes in the operands for that (no `attributes` option), because the finder selects every attribute of the model.

## `FETCH FIRST … WITH TIES`

`withTies: true` with `limit` and `order` returns the first `limit` rows plus every row that ties with the last one on the `order` columns (`FETCH FIRST $1 ROWS WITH TIES`). PostgreSQL rejects it without `ORDER BY`; postgrelize throws `withTies requires a limit` when `limit` is missing.

<<< @/examples/advanced-queries.ts#with-ties{ts}

## Extra relations with `from`

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

## Server-side cursors with `findEach`

`Model.findEach(findOptions, { batchSize })` streams rows with a server-side cursor (`DECLARE ... CURSOR` and `FETCH n`), so a large result is never loaded at once:

<<< @/examples/advanced-queries.ts#find-each{ts}

- The cursor needs a transaction. Pass `transaction`, or `findEach` opens one and commits it when the iteration ends.
- Leaving the loop early (`break`, `return`, an exception) closes the cursor.
- `batchSize` defaults to 100. Includes must be `separate: true`; they are loaded with one extra query per batch. Joined includes are rejected.

For exporting rows as text, [`copyTo`](./bulk-writes#export-with-copyto) is faster still.

## API reference

- [`Model`](/api/classes/Model) — `subquery`, `findEach`
- [`exists`](/api/functions/exists), [`notExists`](/api/functions/notExists), [`over`](/api/functions/over), [`tuple`](/api/functions/tuple), [`where`](/api/variables/where)
- [`CteDefinition`](/api/type-aliases/CteDefinition), [`CteFindOptions`](/api/type-aliases/CteFindOptions), [`WindowOptions`](/api/type-aliases/WindowOptions)
