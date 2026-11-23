# postgrelize usage guide (for LLMs and agents)

`postgrelize` is a PostgreSQL-only ORM for Node.js and TypeScript. It implements the **Sequelize v6 public API** (same names, options, return values, error classes, hook order), so Sequelize v6 knowledge and code carry over. On top of that it adds PostgreSQL features as **new** options and methods (`onConflict`, `Model.insert`, `merge`, CTEs, `copyFrom`, `listen`, advisory locks, `returningOld`). It never changes v6 semantics.

This file is generated from code that is type-checked and run in CI (`docs/examples/llm-usage.ts` and the other `docs/examples/*.ts`), so every snippet compiles and works against the current version. Types are in the package's `.d.ts` files (`node_modules/postgrelize/dist/index.d.ts`); every public item there has TSDoc.

Requirements: Node.js 20+, PostgreSQL 16/17/18, the `pg` package (peer dependency).

## Install

```bash
npm install postgrelize pg
```

Imports read `from 'postgrelize'` (all snippets below use that). ES modules and CommonJS are both shipped. The old name `@tormozz48/postgrelize` (GitHub Packages) is deprecated.

## Imports used in the snippets

<<< @/examples/llm-usage.ts#imports{ts}

## Connect

<<< @/examples/llm-usage.ts#connect{ts}

Create **one** `Sequelize` instance per database. It accepts a URI, `(database, user, password, options)`, or an options object (`host`, `port`, `database`, `username`, `password`, `ssl`, `pool`, `dialectOptions` passed to `pg`, `replication: { read, write }`, `timezone` default `'+00:00'`). `dialect` may be omitted; anything but `'postgres'` throws. Connection failures are `ConnectionError` subclasses.

## Define models

Three equivalent styles. Types: `InferAttributes`, `InferCreationAttributes`, `CreationOptional`, `ForeignKey`, `NonAttribute`.

Class + `init` (typed):

<<< @/examples/llm-usage.ts#define-class{ts}

`sequelize.define` (untyped attributes, returns a model class):

<<< @/examples/llm-usage.ts#define-fn{ts}

Decorators (TC39 or legacy signatures; register with `sequelize.addModels`):

<<< @/examples/llm-usage.ts#decorators{ts}

Common model options: `tableName`, `freezeTableName`, `schema`, `timestamps` (default `true`: `createdAt`/`updatedAt`), `paranoid` (soft delete with `deletedAt`), `underscored`, `version` (optimistic locking, `OptimisticLockError`), `indexes`, `hooks`, `scopes`, `defaultScope`, `validate`. Data types: `DataTypes.INTEGER`, `BIGINT` (returned as string), `DECIMAL` (string), `TEXT`, `STRING(n)`, `BOOLEAN`, `DATE` (timestamptz), `UUID`, `JSONB`, `ARRAY(type)`, `ENUM(...)`, range types, `GEOMETRY` for DDL.

Create tables with `await sequelize.sync()` (tests, prototypes). For production use migrations through `sequelize.getQueryInterface()` (see Schema).

## CRUD cheat sheet

<<< @/examples/llm-usage.ts#crud{ts}

Also available as in v6: `findAndCountAll`, `findOrBuild`, `build` + `save`, `bulkCreate`, `restore`, `increment`/`decrement`, `instance.destroy()`, `instance.set()`/`get()`/`changed()`, `toJSON()`. `rejectOnEmpty: true` makes finders throw `EmptyResultError` instead of returning `null`. `raw: true` returns plain objects; `nest: true` nests dotted keys.

Nested creation: `Model.create(values, { include: [{ association: 'posts' }] })` where `values` contains the nested array. Nested values are not creation attributes in the types, so pass `values` as a variable, not an object literal.

## Where, operators, query options

<<< @/examples/llm-usage.ts#operators{ts}

`Op` has all v6 operators plus PostgreSQL ones. Write JSON paths as dotted keys (`'meta.level'`) or nested objects. Compare columns with `col('name')`. `where(fn/col, Op.x, value)` builds comparisons on expressions.

<<< @/examples/llm-usage.ts#query-options{ts}

Other options: `attributes: { include, exclude }`, `include`, `distinct`, `group`, `having`, `lock`, `transaction`, `paranoid`, `logging`, `benchmark`, scopes via `Model.scope('name')` / `Model.scope({ method: ['name', arg] })`, `findEach` / `findAll` with `limit`/`offset`, keyset pagination with `where(tuple(col('rank'), col('id')), Op.lt, tuple(3, 1))`.

## Associations and include

`hasOne`, `hasMany`, `belongsTo`, `belongsToMany` work as in v6 and generate accessors (`getPosts`, `addTag`, `createPost`, `countPosts`, ...). Declare accessor types with `declare` on the class when using TypeScript.

<<< @/examples/llm-usage.ts#associations{ts}

Include options: `association` (or `model` + `as`), `where`, `required`, `right`, `attributes`, nested `include`, `separate`, `through`, `paranoid`, `all: true`. Eager loading uses JOINs like v6.

## Transactions

Managed (commit on resolve, rollback on throw) and explicit:

<<< @/examples/llm-usage.ts#transactions{ts}

Pass `{ transaction }` to every query that must take part. Nested `sequelize.transaction({ transaction: outer }, fn)` creates a savepoint. Options: `isolationLevel: Transaction.ISOLATION_LEVELS.REPEATABLE_READ`, `readOnly: true`, `settings: { 'app.user_id': 42 }` (SET LOCAL). Row locks: `lock: true` or `Transaction.LOCK.UPDATE`, `skipLocked`, `noWait`. Hooks after commit: `transaction.afterCommit(fn)`.

CLS (implicit transaction in callbacks, a **process-wide** switch; `AsyncLocalStorage` by default, or pass a `cls-hooked` style namespace as in v6: `Sequelize.useCLS(namespace)` stores the transaction under `namespace.get('transaction')`, and a nested `sequelize.transaction(fn)` then opens its own transaction like v6 instead of a savepoint):

<<< @/examples/llm-usage.ts#cls{ts}

## Hooks and validation

<<< @/examples/llm-usage.ts#hooks{ts}

Hook order for `create`: `beforeValidate`, `afterValidate` (or `validationFailed`), `beforeCreate`, `afterCreate`. Updates use `beforeUpdate`/`afterUpdate`; also `beforeSave`/`afterSave`, `beforeDestroy`, `beforeUpsert`, `beforeBulkCreate`, `beforeFind`, `afterFind`. Bulk operations run row hooks only with `individualHooks: true`; `hooks: false` skips hooks for one call. Model lifecycle hooks, `beforeConnect`, `afterConnect` (once per new pooled connection, `(connection, config)`; may run queries on `connection`) and the sync hooks are executed, as are `beforeDefine` / `afterDefine` of a `Sequelize` instance and the static `Sequelize.beforeInit` / `Sequelize.afterInit`; the remaining connection and query hooks are accepted but never called.

Validators in attribute definitions work as in v6 (`validate: { isEmail: true, len: [2, 50] }`, custom functions, model-level `validate`). Extra: `validate: { schema: z.email() }` and model option `validationSchema` accept any Standard Schema library (zod, valibot, arktype).

## Upserts, ON CONFLICT, RETURNING

<<< @/examples/llm-usage.ts#upsert{ts}

- v6 `upsert` returns `[instance, null]` (PostgreSQL does not say whether it inserted). Pass `onConflict` to get a boolean.
- `onConflict: { target: ['a', 'b'] | { constraint } | { columns, where }, action: 'nothing' | { update: ['col'] | { col: expression }, where } }` works in `upsert`, `bulkCreate`, `Model.insert`. Expressions: `excluded('col')`, `literal(...)`, `fn(...)`, `col(...)`. `Model.insert` returns instances with `wasInserted`.
- `returning: true` on `update` / `destroy` returns instances. `returningOld: true` adds `instance.oldValues` (PostgreSQL 18+ only).
- v6 `bulkCreate` options `updateOnDuplicate` with `conflictAttributes`, and `ignoreDuplicates`, still work.

More: `Model.update(values, { where, from: { d: Delivery } })` (UPDATE ... FROM), `Model.destroy({ where, using })`, `Model.insertFrom(subquery, { columns })`, `Model.merge({ source, on, whenMatched, whenNotMatched, whenNotMatchedBySource, returning })` (MERGE, PostgreSQL 17+ for `returning`):

Example: `docs/examples/merge-returning.ts` in the repository (`Stock.merge({ source: [{ sku: 'a', qty: 3 }], on: { sku: col('source.sku') }, whenMatched: { update: { qty: col('source.qty') } }, whenNotMatched: { insert: true }, returning: true })` resolves to `{ rows: [{ action, instance }] }`).

## Subqueries, CTEs, windows

`Model.subquery(findOptions)` builds an embeddable SELECT (use in `Op.in`, attributes, `exists()`). `with: { name: { query, recursive?, materialized? } }` adds CTEs to finders/`count`; `source: 'cte'` reads from one. Window functions through `over(...)`; `distinctOn`. Recursive CTE example: `docs/examples/advanced-queries.ts` (region `recursive-cte`) in the repository.

## COPY, listen/notify, locks

<<< @/examples/copy.ts#copy-from{ts}

`Model.copyTo(options)` streams `COPY ... TO STDOUT` (async iterable of Buffer). `await sequelize.listen('channel', (payload) => ...)` returns an `unlisten` function; `sequelize.notify(channel, payload, { transaction })` delivers on commit. `transaction.advisoryLock(key)` / `tryAdvisoryLock(key)` take transaction-level advisory locks; `sequelize.withAdvisoryLock(key, fn)` runs `fn` in a transaction holding the lock.

## Raw queries

<<< @/examples/llm-usage.ts#raw{ts}

`sequelize.query(sql, { replacements | bind, type: QueryTypes.SELECT, plain, raw, transaction })`. `replacements` use `:name` or `?` and are escaped into the SQL text (several `;`-separated statements work, as in v6), `bind` uses `$1` / `$name` and is sent as parameters. Set `type: QueryTypes.SELECT` to get the rows array directly.

## Schema, sync, migrations

<<< @/examples/schema.ts#migration{ts}

`sequelize.sync()` creates missing tables; `{ alter: true }` adjusts columns; `{ force: true }` drops first (never in production). `sequelize.getQueryInterface()` offers `createTable`, `dropTable`, `addColumn`, `removeColumn`, `changeColumn`, `addIndex`, `addConstraint`, `describeTable`, `showAllTables`, `tableExists`, `dropEnum`, `bulkInsert`, ... Indexes in model options support `unique`, `where` (partial), `using`, `nullsNotDistinct`. `describeTable`, `showAllTables` and `tableExists` default to `current_schema()`.

## Errors to catch

All are exported classes, as in v6.

<<< @/examples/llm-usage.ts#errors{ts}

| Class | When |
| --- | --- |
| `ValidationError` (`.errors[]` of `ValidationErrorItem`) | validators, `allowNull`, schema validation |
| `UniqueConstraintError`, `ForeignKeyConstraintError`, `ExclusionConstraintError` | constraint violation (SQLSTATE 23xxx) |
| `DatabaseError` (`.parent`, `.sql`) | any other server error (syntax, read-only transaction, lock not available, ...) |
| `OptimisticLockError` | stale `version` on save |
| `EmptyResultError` | `rejectOnEmpty` found nothing |
| `ConnectionError` and subclasses (`ConnectionRefusedError`, `ConnectionTimedOutError`, `AccessDeniedError`, ...) | cannot reach or authenticate |
| `TimeoutError` | statement or query timeout |
| `BaseError` | parent of all of them |

## Top mistakes

1. **Forgetting `transaction`.** Queries without `{ transaction }` run on another connection and do not see uncommitted rows (unless CLS is on).
2. **Wrong package name.** Import from `'postgrelize'`; `@tormozz48/postgrelize` is the deprecated GitHub Packages name. Do not install `sequelize` next to it.
3. **Expecting `upsert` to report insert vs update.** It returns `[instance, null]`; use `onConflict`.
4. **`BIGINT` / `DECIMAL` are strings** in results. Convert explicitly.
5. **Using `sync()` as a migration tool in production.** Use `QueryInterface` migrations.
6. **Building SQL from user input** (see Security). Use `where`, `replacements`, `bind`.
7. **Using other dialects or v7 API** (`@sequelize/core`). Only PostgreSQL and the v6 API exist.
8. **Using `beforeQuery`, `afterQuery`, `beforeAssociate`, `afterAssociate`**. They are never called.
9. **`Sequelize.useCLS()` is global.** Call it once at startup, not per instance.
10. **`create(values, { ignoreDuplicates })`** is not supported; use `onConflict: { action: 'nothing' }` or `bulkCreate(..., { ignoreDuplicates })`.

## Differences from Sequelize v6

postgrelize fixes v6 bugs on PostgreSQL instead of copying them (JSON `where` keys with special characters, `upsert` on partial unique indexes, `sync({ alter })` sequences, schema-aware `describeTable`, `Op.any` shorthand, unchecked function names and isolation levels, and more). The full list with issue numbers: <https://tormozz48.github.io/postgrelize/sequelize-issues>. Migration notes: <https://tormozz48.github.io/postgrelize/guide/migrating>.

Not available from v6: other dialects, `Model.schema('tenant')` (use the `schema` option or `search_path` via `dialectOptions: { options: '-c search_path=tenant' }`), the `searchPath` option, named/shared `ENUM` types (each `ENUM` column gets `enum_<table>_<column>`), `create({ ignoreDuplicates })`.

## PostgreSQL features that are NOT supported

Source of truth: <https://tormozz48.github.io/postgrelize/postgresql-coverage> (generated from `docs/coverage/postgresql-features.ts`). "Planned" and "out of scope" rows; most can be done with `sequelize.query()` raw SQL or `literal()`:

{{unsupported}}

## Security rules

- **Values are bound** (`$1..$n`) in `where`, `create`, `update`, `upsert`, `insert`, `merge`, finder `replacements`, `bind`, `NOTIFY` payloads, advisory keys and `settings`. Never concatenate user input into SQL text.
- **Identifiers** (column, table, alias, schema, channel names) are quoted. Operators, function names, cast types, lock strengths, isolation levels and `order` directions are checked against allowlists and throw on anything else. If a column name comes from a user, map it through your own allowlist anyway.
- **`literal()`, raw `sequelize.query` text and string `where` are raw by design** and not escaped. Use them only with constants you wrote.

Full table of inputs and protections: <https://tormozz48.github.io/postgrelize/security>.

## Verify by running

Run the code against a real PostgreSQL (`docker run -e POSTGRES_PASSWORD=pw -p 5432:5432 postgres:17`) and read the result; do not assume a query works. Log SQL with `new Sequelize(url, { logging: console.log })`. When unsure about a signature, read the TSDoc in `node_modules/postgrelize/dist/*.d.ts` or the API reference at <https://tormozz48.github.io/postgrelize/api/>. Full documentation for LLMs: <https://tormozz48.github.io/postgrelize/llms.txt> and <https://tormozz48.github.io/postgrelize/llms-full.txt>.
