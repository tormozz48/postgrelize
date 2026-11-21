# Migrating from Sequelize v6

1. Install `postgrelize` and `pg`; remove `sequelize` and other dialect drivers.
2. Change imports to `from 'postgrelize'` (type helpers keep their v6 names: `InferAttributes`, `CreationOptional`, `ModelStatic`, `WhereOptions`, ...).
3. Connection: omit `dialect` or use `'postgres'`; `dialectOptions` goes to the `pg` pool; `pool.min` and `pool.evict` are accepted but have no effect.
4. Run your tests.

Behaves like v6: `init`/`define`, finders, `create`/`bulkCreate`/`upsert`/`update`/`destroy`, instances and change tracking, hooks, validators, scopes, paranoid, optimistic locking, associations, nested creation, managed and unmanaged transactions, CLS, `QueryInterface`, `sync`. `BIGINT` and `DECIMAL` are strings; `upsert` returns `[instance, null]`.

Intentional differences (v6 bugs fixed on PostgreSQL): JSON `where` keys with special characters, `upsert` on partial unique indexes, `sync({ alter })` sequences, `describeTable`/`showAllTables`/`tableExists` use `current_schema()`, `Op.any` shorthand, validated function names and isolation levels, and more. Full list with issue numbers: <https://tormozz48.github.io/postgrelize/sequelize-issues>.

Not supported: other dialects, `Model.schema('tenant')` (use the `schema` option), the `searchPath` option (use `dialectOptions: { options: '-c search_path=tenant' }`), named/shared `ENUM` types, `create({ ignoreDuplicates })`, Sequelize v7 API. Connection, sync and define hooks are accepted but never called.

After migrating, replace workarounds with native features: `literal()` upserts and `updateOnDuplicate` → `onConflict`; loops of `update` → `UPDATE ... FROM` / `merge`; large `bulkCreate` → `copyFrom`; hand-written CTEs → `with`.
