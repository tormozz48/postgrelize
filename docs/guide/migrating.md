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

The package ships ES modules and CommonJS, so `require('postgrelize')` works as well. Type helpers (`InferAttributes`, `InferCreationAttributes`, `CreationOptional`, `ForeignKey`, `NonAttribute`, `ModelStatic`, `WhereOptions`, ...) are exported under their v6 names.

## 3. Check the connection options

- Only PostgreSQL is supported. Omit `dialect` or set it to `'postgres'`; any other value throws.
- `dialectOptions` is passed to the [`pg`](https://node-postgres.com/) pool as is.
- `pool` accepts `max`, `min`, `idle`, `acquire`, `evict` and `maxUses`. `min` and `evict` are accepted for compatibility but have no effect: `pg` does not keep idle connections open.
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
- `order: ['json.path']` orders by the jsonb value (numbers sort numerically).
- Foreign-key cycles in `sync()` are created after all tables exist instead of being skipped.

The full list, with the Sequelize issue numbers and regression tests, is on [Sequelize issues fixed in postgrelize](/sequelize-issues). If your code depends on one of these v6 behaviours, it needs a change.

## Not supported

These Sequelize v6 features are not implemented:

| Feature                                | What to do instead                                                                                    |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Other dialects (MySQL, SQLite, MSSQL…) | postgrelize is PostgreSQL only.                                                                       |
| `minifyAliases`                        | Not available; keep association aliases short in deeply nested includes.                              |
| `searchPath` query / connection option | Set `search_path` with `dialectOptions: { options: '-c search_path=tenant' }`.                        |
| Named or shared `ENUM` types           | Each `ENUM` attribute gets its own type, `enum_<table>_<column>`, as v6 does by default.              |
| `create({ ignoreDuplicates })`         | `create(values, { onConflict: { action: 'nothing' } })` or `bulkCreate([...], { ignoreDuplicates })`. |
| Sequelize v7 (`@sequelize/core`) API   | Not planned.                                                                                          |

Hooks are accepted for every v6 hook name, but model lifecycle hooks, `beforeConnect`, `afterConnect` and the sync hooks (`beforeBulkSync`, `afterBulkSync`, `beforeSync`, `afterSync`) run; other connection and define hooks (`beforeDefine`, ...) are registered and never called. See [Hooks and validation](./hooks-validation).

## Using the PostgreSQL extensions

Once the application runs on postgrelize, you can replace workarounds with native features step by step:

- `literal()`-based upserts and `updateOnDuplicate` → [`onConflict` and `Model.insert`](./upserts)
- loops of `update` → [`UPDATE ... FROM` and `MERGE`](./bulk-writes)
- large `bulkCreate` imports → [`COPY`](./bulk-writes#copy)
- `sequelize.query` with hand-written CTEs and window functions → [advanced queries](./advanced-queries)

Extensions are additive: they are new options or new methods, and none of them changes the behaviour of v6 calls.
