# Querying

Finders, `where` operators, ordering, grouping, aggregates, scopes and raw queries follow Sequelize v6. This page shows the common patterns and the PostgreSQL-specific operators. For subqueries, CTEs and window functions see [Advanced queries](./advanced-queries).

The examples use this model:

```ts
const Item = sequelize.define('Item', {
  code: DataTypes.TEXT,
  qty: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  attrs: DataTypes.JSONB,
  tags: DataTypes.ARRAY(DataTypes.TEXT),
});
```

## Filtering

`where` takes attribute hashes, `Op` operators, `Op.and` / `Op.or` / `Op.not`, and nested JSON paths with dotted keys:

<<< @/examples/querying.ts#where{ts}

Supported operators are the v6 ones for PostgreSQL: comparison (`eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `between`, `notBetween`), lists (`in`, `notIn`, `any`, `all`), text (`like`, `iLike`, `startsWith`, `endsWith`, `substring`, `regexp`, `iRegexp` and their negations), `is` / `not`, arrays and ranges (`contains`, `contained`, `overlap`, `adjacent`, `strictLeft`, `strictRight`, `noExtendLeft`, `noExtendRight`), full-text `match`, and `col` for column comparisons.

PostgreSQL additions and fixes:

- `Op.isDistinctFrom` / `Op.isNotDistinctFrom` compare with `IS [NOT] DISTINCT FROM`, which treats `NULL` as a value.
- `Op.hasKey`, `Op.hasAnyKeys`, `Op.hasAllKeys` map to the jsonb `?`, `?|` and `?&` operators; they also work on nested JSON paths.
- `{ [Op.any]: [1, 3] }` is shorthand for `= ANY($1)` with one array parameter.
- `IN` lists with 100 or more values are sent as `= ANY($1)` with a single array parameter instead of one parameter per value. Change the threshold with the `inAsAnyThreshold` constructor option.

## Operator and search helpers

PostgreSQL operators that Sequelize v6 leaves to `literal()` have first-class `Op` entries and expression helpers. Every value is a bound parameter; regconfig names, weights and function kinds are validated.

**`SIMILAR TO`.** `Op.similarTo` / `Op.notSimilarTo` take an SQL regular expression. `%`, `_`, `|`, `*`, `+`, `?`, `{}`, `()`, `[]` and `\` are pattern syntax: escape them with `\` to match literally.

<<< @/examples/operator-helpers.ts#similar-to{ts}

**jsonpath.** `Op.jsonPathExists` is `@?`; `@@` for a jsonpath predicate is `where(col('attrs'), Op.match, '$.price > 10')` (use `where()` so the string is not serialized as a JSON value). `jsonbPath(kind, target, path, { vars, silent, tz })` calls `jsonb_path_exists`, `jsonb_path_match`, `jsonb_path_query`, `jsonb_path_query_first` or `jsonb_path_query_array`; `vars` are passed as one bound jsonb parameter.

<<< @/examples/operator-helpers.ts#jsonpath{ts}

**Network.** `Op.containedOrEqual` (`<<=`) and `Op.containsOrEqual` (`>>=`) are new; `<<`, `>>` and `&&` are `Op.strictLeft`, `Op.strictRight` and `Op.overlap`. `host()`, `network()` and the other functions go through `fn()`.

<<< @/examples/operator-helpers.ts#network{ts}

**Full-text search.** `toTsVector`, `toTsQuery`, `plainToTsQuery`, `phraseToTsQuery` and `websearchToTsQuery` take an optional text search configuration (`'english'`, `'pg_catalog.simple'`). `tsRank` (with `cd`, `weights`, `normalization`), `tsHeadline` and `setWeight` cover ranking and highlighting. Use `Op.match` for `@@`.

<<< @/examples/operator-helpers.ts#full-text{ts}

**Trigram similarity (`pg_trgm`).** Run `CREATE EXTENSION pg_trgm` first. `Op.trigramSimilar` (`%`), `Op.trigramWordSimilar` (`<%`), `Op.trigramStrictWordSimilar` (`<<%`) and the commutators `Op.trigramHasSimilarWord` (`%>`), `Op.trigramHasSimilarStrictWord` (`%>>`) filter; `trigramSimilarity`, `trigramWordSimilarity` and `trigramDistance` (`<->`) build expressions for `attributes` and `order`. The similarity threshold is the `pg_trgm.similarity_threshold` setting.

<<< @/examples/operator-helpers.ts#trigram{ts}

## Selecting, ordering and paginating

`attributes` selects columns (`['id', 'code']`, `{ exclude: [...] }`, `{ include: [...] }`, or `[expression, 'alias']` pairs). `order` takes `[attribute, direction]` pairs, expressions, and nested association paths. Directions are allow-listed: `ASC`, `DESC`, optionally with `NULLS FIRST` / `NULLS LAST`.

<<< @/examples/querying.ts#pagination{ts}

`findOne`, `findByPk`, `findOrCreate`, `findOrBuild` and `findAndCountAll` behave as in v6. Pass `rejectOnEmpty: true` to throw `EmptyResultError` instead of returning `null`. `raw: true` returns plain objects, and `nest: true` turns dotted keys into nested objects.

## Aggregates and expressions

<<< @/examples/querying.ts#aggregates{ts}

`count`, `sum`, `min`, `max` and `aggregate` accept the same `where` as finders; `aggregate` and the helpers convert the result to the type of the attribute (`FLOAT` for `'*'`), `dataType` overrides that, and `plain: false` returns the raw rows with the driver's strings (like v6); `count` also takes `distinct`, `col` and `group`. `increment` and `decrement` work on the model (with `where`) and on instances.

Build SQL expressions with `fn`, `col`, `literal`, `cast`, `json` and `where`. Values inside them are bound parameters; identifiers are quoted. Use `literal` only with trusted SQL text.

## Scopes

Scopes are named sets of query options, defined with `scopes` and `defaultScope` in the model options or later with `addScope`:

<<< @/examples/querying.ts#scopes{ts}

As in v6, `scope()` merges scopes, `unscoped()` removes the default scope, and function scopes take arguments through `{ method: [name, ...args] }`.

By default, when two merged scopes filter the same attribute, the later one wins (the v6 behaviour). The model option `whereMergeStrategy: 'and'` combines them with `AND` instead:

```ts
sequelize.define('Person', attributes, {
  whereMergeStrategy: 'and',
  scopes: {
    adults: { where: { age: { [Op.gte]: 18 } } },
    young: { where: { age: { [Op.lt]: 30 } } },
  },
});
await Person.scope('adults', 'young').findAll(); // 18 <= age < 30
```

## Raw SQL

`sequelize.query` runs SQL with named replacements (`:name`, escaped into the SQL text) or bind parameters (`$1`, sent separately). `type: QueryTypes.SELECT` returns the rows only:

<<< @/examples/querying.ts#raw{ts}

`sequelize.query` returns `Promise<unknown>`; cast the result to the row type you expect. The result follows the query `type` like v6: `SELECT` rows, `INSERT` / `UPDATE` `[rows, rowCount]`, `DELETE` the statement rows (`[]` without `RETURNING`), `BULKUPDATE` / `BULKDELETE` the row count, `UPSERT` `[undefined, null]`. Other v6 options are supported: `plain`, `raw`, `model` / `mapToModel`, `transaction`, `logging`.

## Locking

`lock: true` (or `Transaction.LOCK.UPDATE`, `SHARE`, `KEY_SHARE`, `NO_KEY_UPDATE`) adds `FOR UPDATE` and friends; `skipLocked: true` adds `SKIP LOCKED`, and `noWait: true` (a PostgreSQL extension) adds `NOWAIT`. Locks need a transaction, see [Transactions](./transactions#row-locks).

## API reference

- [`Model`](/api/classes/Model) — finders and aggregates
- [`FindOptions`](/api/type-aliases/FindOptions), [`WhereOptions`](/api/type-aliases/WhereOptions)
- [`Op`](/api/variables/Op), [`fn`](/api/functions/fn), [`col`](/api/functions/col), [`literal`](/api/functions/literal)
- [`Sequelize.query`](/api/classes/Sequelize)
