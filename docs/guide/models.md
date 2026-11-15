# Models and data types

Models work as in Sequelize v6: extend `Model` and call `init`, or use `sequelize.define`. Both forms accept the same attribute and model options.

## Class models

Declare attributes with `declare` so TypeScript knows their types without emitting class fields that would shadow the attribute getters. `InferAttributes<T>` collects the declared fields; `InferCreationAttributes<T>` additionally makes `CreationOptional` fields optional in `create` and `build`.

<<< @/examples/models.ts#class{ts}

The example shows:

- a custom setter (`set`) that normalizes the value before it is stored, using `setDataValue`;
- a `VIRTUAL` attribute with a getter: it is never stored, but is part of `get()` and `toJSON()`;
- `ARRAY`, `JSONB` and `ENUM` columns with defaults;
- `underscored: true`, which maps `createdAt` to `created_at` and so on, and `tableName` to skip pluralization.

Other type helpers from v6 are available: `ForeignKey<T>` for foreign key attributes created by associations, and `NonAttribute<T>` for class fields that are not columns (for example, included associations).

## Decorators

Models can also be declared with decorators (`@Table`, `@Column`, `@HasMany`, …) and registered with `sequelize.addModels`; see [Decorators](/guide/decorators).

## `sequelize.define`

`define` returns a model class without static attribute types. It is convenient in scripts and tests:

<<< @/examples/models.ts#define{ts}

`paranoid: true` adds `deletedAt`: `destroy()` sets it instead of deleting the row, finders skip such rows, and `paranoid: false` in find options includes them. `restore()` brings them back; `destroy({ force: true })` deletes for real.

## Using instances

<<< @/examples/models.ts#use{ts}

Instances track changes as in v6: `changed()`, `previous()`, `save()` writes only changed attributes, `reload()` reads the row again, and `toJSON()` returns plain values. Like v6, an attribute that was assigned a different value stays in `changed()` even when you set it back to the stored value.

`create` and `bulkCreate` accept `fields` to restrict which attributes are written. As in v6, the timestamps (`createdAt`, `updatedAt`), the version attribute and primary keys with a default are added to the list for you:

<<< @/examples/models.ts#fields{ts}

`Model.schema(name)` returns a copy of the model whose queries target another PostgreSQL schema, e.g. one per tenant. `getTableName()` of the copy returns `{ tableName, schema, delimiter }`; the copy keeps the scope selection of the model it was made from, and `unscoped()` / `scope()` work on it. Hooks, scopes and associations are copied when `schema()` is called; later changes to the original are not seen by the copy.

<<< @/examples/models.ts#schema{ts}

## Data types

`DataTypes` contains the Sequelize v6 types that PostgreSQL supports:

| Category       | Types                                                                                 |
| -------------- | ------------------------------------------------------------------------------------- |
| Text           | `STRING(n)` (`VARCHAR`), `CHAR(n)`, `TEXT`, `CITEXT`                                  |
| Numbers        | `INTEGER`, `SMALLINT`, `BIGINT`, `FLOAT`, `REAL`, `DOUBLE`, `DECIMAL(p, s)`           |
| Date and time  | `DATE` (`TIMESTAMP WITH TIME ZONE`), `DATEONLY`, `TIME`, `INTERVAL`                   |
| Other scalars  | `BOOLEAN`, `UUID`, `BLOB` (`BYTEA`), `INET`, `CIDR`, `MACADDR`, `TSVECTOR`            |
| Structured     | `JSON`, `JSONB`, `HSTORE`, `ARRAY(type)`, `RANGE(type)`, `ENUM(...values)`            |
| PostGIS        | `GEOMETRY`, `GEOGRAPHY`                                                               |
| Not stored     | `VIRTUAL`                                                                             |
| Default values | `DataTypes.NOW` (current time), `DataTypes.UUIDV4` (random UUID generated in Node.js) |

As in v6, `BIGINT` and `DECIMAL` values are returned as strings to avoid precision loss. `INTERVAL` values are strings in PostgreSQL output format (`'1 year 2 mons'`). `RANGE` values are arrays of two bounds, `{ value, inclusive }` objects as in v6.

`ENUM` creates a PostgreSQL enum type named `enum_<table>_<column>`. `sync({ alter: true })` adds new values to an existing enum type.

## Identity and generated columns

Two column kinds that Sequelize v6 cannot create:

<<< @/examples/models.ts#postgres-columns{ts}

- `identity: 'always'` or `'byDefault'` creates `GENERATED { ALWAYS | BY DEFAULT } AS IDENTITY` instead of `SERIAL`. To write an explicit value into a `GENERATED ALWAYS` column, pass `overriding: 'system'` to `create`, `bulkCreate`, `upsert` or `insert`.
- `generated: { as: expression }` creates a stored generated column. postgrelize never writes it in `INSERT` or `UPDATE` and reads the computed value back after each write. `generated: { as, stored: false }` creates a virtual generated column, which needs PostgreSQL 18.
- `INTERVAL` is a plain data type here; Sequelize v6 has no interval type.

## Model options

The options of `init` / `define` are the v6 ones: `tableName`, `freezeTableName`, `schema`, `timestamps`, `createdAt` / `updatedAt` / `deletedAt` (rename or disable with `false`), `underscored`, `paranoid`, `version` (optimistic locking), `indexes`, `hooks`, `scopes`, `defaultScope`, `validate`. postgrelize adds:

- `validationSchema`: a [Standard Schema](./hooks-validation#standard-schema) validating the whole row;
- `whereMergeStrategy: 'and'` for scopes, see [Querying](./querying#scopes).

Defaults for all models go into the `define` option of the `Sequelize` constructor, e.g. `new Sequelize(url, { define: { underscored: true } })`.

## API reference

- [`Model`](/api/classes/Model)
- [`DataTypes`](/api/variables/DataTypes)
- [`AttributeOptions`](/api/type-aliases/AttributeOptions), [`InitOptions`](/api/type-aliases/InitOptions)
