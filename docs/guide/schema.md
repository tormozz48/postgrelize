# Schema, sync and migrations

postgrelize creates and changes tables in two ways, both compatible with Sequelize v6: `sync()` derives the schema from model definitions, and `QueryInterface` runs explicit DDL for migrations (umzug, sequelize-cli style migration files).

## `sync`

`sequelize.sync()` creates missing tables, enum types, indexes and foreign keys for all defined models; `Model.sync()` does it for one model. Indexes come from the `indexes` model option and from `unique` attribute options:

<<< @/examples/schema.ts#sync{ts}

`sync` options:

| Option            | Effect                                                                                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (none)            | `CREATE TABLE IF NOT EXISTS`; existing tables are left as they are.                                                                                                   |
| `force: true`     | Drops and recreates the tables. Data is lost.                                                                                                                         |
| `alter: true`     | Compares each table with the model and adds, changes or drops columns, enum values and constraints. `alter: { drop: false }` keeps columns that are not in the model. |
| `match: /_test$/` | Throws unless the database name matches the pattern (a safety net for `force`).                                                                                       |
| `schema`          | Creates the tables in this PostgreSQL schema.                                                                                                                         |

<<< @/examples/schema.ts#alter{ts}

`sync({ alter: true })` is convenient during development; for production, prefer migrations that you review. `sequelize.drop()` and `Model.drop()` drop the tables (`cascade` and `schema` options as in v6).

### PostgreSQL index and constraint options

Index options are the v6 ones (`name`, `fields`, `unique`, `using`, `operator`, `where`, `concurrently`) plus:

- `nullsNotDistinct: true` → `UNIQUE NULLS NOT DISTINCT`: `NULL` values count as equal, so only one row may have `NULL` in the key. Also accepted in the attribute option `unique: { nullsNotDistinct: true }`.
- `include: ['col']` → covering index (`INCLUDE (...)`).
- `ifNotExists: true` → `CREATE INDEX IF NOT EXISTS`.

Foreign keys accept `deferrable: Deferrable.INITIALLY_DEFERRED` (or `INITIALLY_IMMEDIATE`, `NOT`) in `references`, so the constraint is checked at commit.

## Migrations with `QueryInterface`

`sequelize.getQueryInterface()` returns a `QueryInterface` with the v6 methods. A migration is a pair of `up` / `down` functions receiving it, as with [umzug](https://github.com/sequelize/umzug) or sequelize-cli:

<<< @/examples/schema.ts#migration{ts}

<<< @/examples/schema.ts#query-interface{ts}

Available methods:

- tables: `createTable`, `dropTable`, `dropAllTables`, `renameTable`, `tableExists`, `showAllTables`, `describeTable`
- columns: `addColumn`, `removeColumn`, `changeColumn`, `renameColumn`
- indexes and constraints: `addIndex`, `removeIndex`, `addConstraint`, `removeConstraint`, `getForeignKeyReferencesForTable`
- schemas and enums: `createSchema`, `dropSchema`, `showAllSchemas`, `dropEnum`, `dropAllEnums`
- extensions and sequences: `createExtension`, `dropExtension`, `createSequence`, `alterSequence`, `dropSequence`, `nextval`, `setval` (see [Schema objects](/guide/schema-objects))
- data: `bulkInsert`, `bulkUpdate`, `bulkDelete`

All methods take a `transaction` option, so a migration can run in one transaction. Table names may be strings or `{ tableName, schema }` objects.

## Differences from Sequelize v6

- `describeTable`, `showAllTables` and `tableExists` look in `current_schema()` (the first schema of `search_path`) when no schema is given; v6 always uses `public`.
- `describeTable` returns literal defaults unquoted (`it's`, not `'it''s'::text`).
- `sync({ alter: true })` keeps the sequence of non-key `autoIncrement` columns and does not duplicate foreign keys when tables live in a non-default schema.
- `sync({ schema })` / `drop({ schema })` only touch that schema, even if tables with the same name exist elsewhere.
- Foreign-key cycles are created after all tables exist.

The details and issue links are on [Sequelize issues fixed](/sequelize-issues).

## API reference

- [`QueryInterface`](/api/classes/QueryInterface)
- [`SyncOptions`](/api/type-aliases/SyncOptions), [`AlterOptions`](/api/type-aliases/AlterOptions)
- [`IndexOptions`](/api/type-aliases/IndexOptions), [`Deferrable`](/api/variables/Deferrable)
