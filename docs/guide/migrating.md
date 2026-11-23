# Migrating from Sequelize

postgrelize implements the public API of Sequelize v6 for PostgreSQL. A differential test suite runs the same scenarios on `sequelize@6` and on postgrelize and compares the results, so for most applications migrating is a change of the package name.

## 1. Replace the packages

Remove `sequelize` and `pg-hstore` (postgrelize does not use it), and install postgrelize from npmjs.com:

```bash
npm uninstall sequelize pg-hstore
npm install postgrelize pg
```

If you installed the deprecated GitHub Packages name `@tormozz48/postgrelize` (or the alias `postgrelize@npm:@tormozz48/postgrelize`), remove the `.npmrc` scope line, run `npm uninstall @tormozz48/postgrelize` and install `postgrelize` as above. Imports from `'@tormozz48/postgrelize'` become `'postgrelize'`; the API is identical.

## 2. Update imports

Replace `'sequelize'` with `'postgrelize'`. The exported names are the same as in Sequelize v6:

```ts
// before
import { DataTypes, Model, Op, Sequelize, Transaction } from 'sequelize';
// after
import { DataTypes, Model, Op, Sequelize, Transaction } from 'postgrelize';
```

The package ships ES modules and CommonJS. As in v6, the default export and `require('postgrelize')` are the `Sequelize` class (`import Sequelize from 'postgrelize'`, `const Sequelize = require('postgrelize')`, `new Sequelize(url)`), and every named export is also a property of it (`require('postgrelize').DataTypes`). One CommonJS difference: `require('postgrelize').HasOne`, `HasMany`, `BelongsTo` and `BelongsToMany` are the decorators, not v6's association classes. Type helpers (`InferAttributes`, `InferCreationAttributes`, `CreationOptional`, `ForeignKey`, `NonAttribute`, `ModelStatic`, `WhereOptions`, ...) are exported under their v6 names.

## TypeScript types

The type API follows the v6 declarations, so code that compiles against `sequelize` compiles against postgrelize: `Model<TAttributes extends {} = any, TCreationAttributes = TAttributes>`, `ModelStatic`, `FindOptions`, `Includeable`, the `Sequelize#query` overloads (`query<T>(sql, { type: QueryTypes.SELECT })`), generic `Association<S, T>` and the association mixin types (`BelongsToGetAssociationMixin<T>`, `HasManyGetAssociationsMixin<T>`, ...). A test compiles a corpus of v6-style code against both libraries and lists the v6 type names and option keys that postgrelize still lacks (`tests/compat/type-parity/exceptions.json`).

Differences to know:

- `HasMany`, `HasOne`, `BelongsTo` and `BelongsToMany` are exported as generic types next to the decorators of the same names; use `Sequelize.HasMany` (and the others) for the class value.
- `InitOptions.name` (`{ singular, plural }`) works as in v6: it gives the default alias and foreign key of `belongsTo`, `hasOne`, `hasMany` and `belongsToMany` and the accessor names (`name: { singular: 'user', plural: 'users' }` makes `Agent.belongsTo(User)` use alias `user` and foreign key `userId`). A missing form falls back to the inflected `modelName`. Before this release the option was ignored.
- `onDelete: 'CASCADE'` with `hooks: true` on an association works as in v6: destroying an instance loads the associated rows and destroys each with its own hooks before the row itself is deleted (not for the soft delete of a paranoid model). Without `hooks: true` PostgreSQL cascades the delete and no hooks of the target run. `QueryInterface#queryGenerator` only provides `selectQuery(tableName, options, model)`, which renders finder options to a SQL string (values as escaped literals, no scope or paranoid filter), as in v6; the other v6 generator methods do not exist.
- `findAndCountAll({ group })` returns `count` as an array of `{ ...groupedAttributes, count }` like v6 (earlier releases ignored `group` in the count query).
- `FindOptions.replacements` works as in v6: `:name` and `?` placeholders inside `literal()` (in `where`, `attributes`, `order`, ...) of `findAll`, `findOne`, `findByPk`, `count` and `findAndCountAll` are substituted and written into the SQL text as escaped literals, as in v6, so a placeholder used in `SELECT` and `GROUP BY` gives identical expressions (1.6.0; ADR-037). Unlike v6, `update` and `destroy` accept `replacements` too (v6 rejects them for `update`). Before 1.3.0 the finders ignored the option.
- `Model#reload(options)` takes the finder options (`include`, `attributes`, `paranoid`, `lock`, `hooks`, ...) and reads the row through `findOne`, so default scopes and `paranoid` apply as in v6: reloading a soft-deleted row needs `paranoid: false`. Associations the instance was built with are not reloaded unless you pass `include`.
- `findByPk(id, { rejectOnEmpty: true })` resolves to the model (not `M | null`), as `findOne` does.
- `sequelize.query` accepts a string or a `literal()`, not the v6 `{ query, values }` object form.
- Option keys that postgrelize does not implement (`searchPath`, `omitNull`, ...) are not in the option types, so the compiler points at them.
- `Model.sequelize` and `instance.sequelize` are typed `Sequelize` (not optional, it throws on a model that is not initialized), `WhereAttributeHash` defaults to `any`, attribute `get` / `set` and model-level `validate` functions can be written with a typed `this` and a callback style `next`, and the parameters of hook functions are `any` so an unannotated hook compiles.

## 3. Check the connection options

- Only PostgreSQL is supported. Omit `dialect` or set it to `'postgres'`; any other value throws.
- `dialectOptions` is passed to the [`pg`](https://node-postgres.com/) pool as is.
- `pool` accepts `max`, `min`, `idle`, `acquire`, `evict` and `maxUses`. `min` and `evict` are accepted for compatibility but have no effect: `pg` does not keep idle connections open.
- `retry` (instance option and per-query / per-transaction option) is supported with the v6 fields and matching rules; it is off by default, as v6's default only lists a SQLite message. Statements inside an open transaction are not retried (v6 retries them). See [Retrying failed queries](/guide/sessions#retrying-failed-queries).
- `sequelize.connectionManager` exposes `getConnection(options?)`, `releaseConnection(connection)`, `destroyConnection(connection)` and the `pool` counters (`size`, `available`, `using`, `waiting`, `maxSize`), and you can reassign the first two on the instance to route connections, as in v6. With `replication`, `pool` carries the totals plus `read` and `write` counters (v6 has no totals there), and `getConnection({ type: 'read' })` reaches a replica (v6 reaches it only for `'SELECT'`). The other v6 members (`initPools`, `close`, `refreshTypeParser`, `pool.acquire` / `pool.drain`, ...) are not provided. See [Routing connections](/guide/sessions#routing-connections).
- `minifyAliases: true` works as in v6 for include aliases, see [Associations](./associations#eager-loading).
- `replication: { read, write }` works as in v6, see [Sessions and scaling](./sessions#read-replicas).

## 4. Run your tests

Things that behave the same as in Sequelize v6 include model definition (`init`, `define`), all finders, `create`/`bulkCreate`/`upsert`/`update`/`destroy`, instance methods and change tracking, hooks, validators, scopes, paranoid models, optimistic locking, associations with `include` and accessors, nested creation with `include`, managed and unmanaged transactions with savepoints and CLS (`Sequelize.useCLS()` and `Sequelize.useCLS(namespace)` with a `cls-hooked` namespace), `QueryInterface` and `sync`.

Value conventions follow v6 too: `BIGINT` and `DECIMAL` values are strings, and `upsert` returns `[instance, null]` because PostgreSQL does not report whether a row was inserted (use the [`onConflict` option](./upserts) to get a boolean).

## Intentional differences

Some Sequelize v6 behaviours are bugs on PostgreSQL. postgrelize fixes them instead of copying them, for example:

- JSON `where` keys containing `,`, `"` or `\` are matched correctly.
- `upsert` on a partial unique index uses the index predicate.
- `sync({ alter: true })` keeps the sequence of non-key `autoIncrement` columns.
- `describeTable`, `showAllTables` and `tableExists` default to `current_schema()` instead of `public`, so they respect `search_path`.
- `findCreateFind` inside a transaction inserts in a savepoint: when another session inserted the row first it returns that row with `created: false`; v6 returns an unsaved instance with `created: true`.
- `order: ['json.path']` orders by the jsonb value (numbers sort numerically).
- Foreign-key cycles in `sync()` are created after all tables exist instead of being skipped.

The full list, with the Sequelize issue numbers and regression tests, is on [Sequelize issues fixed in postgrelize](/sequelize-issues). If your code depends on one of these v6 behaviours, it needs a change.

## Not supported

These Sequelize v6 features are not implemented:

| Feature                                | What to do instead                                                                                    |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Other dialects (MySQL, SQLite, MSSQL…) | postgrelize is PostgreSQL only.                                                                       |
| `searchPath` query / connection option | Set `search_path` with `dialectOptions: { options: '-c search_path=tenant' }`.                        |
| Named or shared `ENUM` types           | Each `ENUM` attribute gets its own type, `enum_<table>_<column>`, as v6 does by default.              |
| `create({ ignoreDuplicates })`         | `create(values, { onConflict: { action: 'nothing' } })` or `bulkCreate([...], { ignoreDuplicates })`. |
| Sequelize v7 (`@sequelize/core`) API   | Not planned.                                                                                          |

Hooks are accepted for every v6 hook name, but model lifecycle hooks, `beforeConnect`, `afterConnect`, the sync hooks (`beforeBulkSync`, `afterBulkSync`, `beforeSync`, `afterSync`), the define hooks of the instance (`beforeDefine`, `afterDefine`) and the static `Sequelize.beforeInit` / `Sequelize.afterInit` run; the other connection hooks and `beforeQuery`, `beforeAssociate`, ... are registered and never called. See [Hooks and validation](./hooks-validation).

## API differences

postgrelize is checked against the public API of Sequelize v6.37 (`Sequelize`, `Model`, `QueryInterface`, `Transaction`, `DataTypes` and the exports): a test fails when a v6 name is missing and not listed here. The list below is generated from `tests/compat/api-surface-exceptions.json` and only shrinks.

<!-- api-differences:start -->

| Surface                | Status              | Names                                                                                                                                                                                                      |
| ---------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Sequelize` statics    | Not planned         | `ABSTRACT`, `UUIDV1`                                                                                                                                                                                       |
| `Sequelize` statics    | Other dialects only | `IndexHints`, `TableHints`, `db2`, `mariadb`, `mssql`, `mysql`, `oracle`, `postgres`, `snowflake`, `sqlite`                                                                                                |
| `Sequelize` statics    | v6 internals        | `AsyncQueueError`, `Sequelize`, `default`                                                                                                                                                                  |
| `Sequelize` instance   | Not planned         | `afterAssociate`, `afterDefine`, `afterDisconnect`, `afterInit`, `afterPoolAcquire`, `afterQuery`, `beforeAssociate`, `beforeDefine`, `beforeDisconnect`, `beforeInit`, `beforePoolAcquire`, `beforeQuery` |
| `Sequelize` instance   | Other dialects only | `set`                                                                                                                                                                                                      |
| `Sequelize` instance   | v6 internals        | `Sequelize`, `dialect`, `normalizeAttribute`, `normalizeDataType`                                                                                                                                          |
| `Model` statics        | Not planned         | `afterAssociate`, `afterBulkSync`, `afterQuery`, `beforeAssociate`, `beforeBulkSync`, `beforeQuery`                                                                                                        |
| `Model` statics        | v6 internals        | `Mixin`, `default`, `queryGenerator`, `warnOnInvalidOptions`                                                                                                                                               |
| `Model` instance       | Not planned         | `addHook`, `hasHook`, `hasHooks`, `removeHook`, `runHooks`, `setValidators`                                                                                                                                |
| `Transaction` statics  | v6 internals        | `Transaction`, `default`                                                                                                                                                                                   |
| `Transaction` instance | v6 internals        | `cleanup`, `forceCleanup`, `prepareEnvironment`, `setDeferrable`                                                                                                                                           |
| `QueryInterface`       | Not planned         | `commitTransaction`, `decrement`, `delete`, `increment`, `insert`, `rawSelect`, `rollbackTransaction`, `select`, `setIsolationLevel`, `startTransaction`, `update`, `upsert`                               |
| `QueryInterface`       | v6 internals        | `ensureEnums`, `normalizeAttribute`, `pgListEnums`                                                                                                                                                         |
| `DataTypes`            | Not planned         | `ABSTRACT`, `UUIDV1`                                                                                                                                                                                       |
| `DataTypes`            | Other dialects only | `db2`, `mariadb`, `mssql`, `mysql`, `oracle`, `postgres`, `snowflake`, `sqlite`                                                                                                                            |
| Module exports         | Not planned         | `ABSTRACT`, `UUIDV1`                                                                                                                                                                                       |
| Module exports         | Other dialects only | `IndexHints`, `TableHints`                                                                                                                                                                                 |
| Module exports         | v6 internals        | `AsyncQueueError`                                                                                                                                                                                          |

<!-- api-differences:end -->

## Using the PostgreSQL extensions

Once the application runs on postgrelize, you can replace workarounds with native features step by step:

- `literal()`-based upserts and `updateOnDuplicate` → [`onConflict` and `Model.insert`](./upserts)
- loops of `update` → [`UPDATE ... FROM` and `MERGE`](./bulk-writes)
- large `bulkCreate` imports → [`COPY`](./bulk-writes#copy)
- `sequelize.query` with hand-written CTEs and window functions → [advanced queries](./advanced-queries)

Extensions are additive: they are new options or new methods, and none of them changes the behaviour of v6 calls.
