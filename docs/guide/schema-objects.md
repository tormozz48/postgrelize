# Schema objects

`QueryInterface` creates more than tables: extensions, sequences, views, functions, triggers and row-level security policies. These are PostgreSQL features, so they are additions to Sequelize v6 (except `createFunction` and `createTrigger`, which v6 has too). Object names are always quoted identifiers; the few places that take SQL text are listed in [Security](/security).

## Extensions

<<< @/examples/schema-objects.ts#extension{ts}

`createExtension(name, { ifNotExists, schema, version, cascade })` and `dropExtension(name, { ifExists, cascade })`. The database role needs the privileges PostgreSQL requires for that extension.

## Sequences

<<< @/examples/schema-objects.ts#sequence{ts}

- `createSequence(name, { dataType, start, increment, minValue, maxValue, cache, cycle, ownedBy, ifNotExists })`: `minValue` / `maxValue` accept `false` for `NO MINVALUE` / `NO MAXVALUE`; numbers are `number` or `bigint` and must be whole.
- `alterSequence(name, { restartWith, increment, ... })`, `dropSequence(name, { ifExists, cascade })`.
- `nextval(name)` and `setval(name, value, isCalled = true)` return the value as text, so bigint values stay exact.

Sequences of `autoIncrement` and identity columns are created by `sync`; use these methods for standalone counters.

## API reference

- [`QueryInterface`](/api/classes/QueryInterface)
