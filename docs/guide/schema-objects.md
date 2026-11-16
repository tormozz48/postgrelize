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

## Functions and triggers

`createFunction`, `dropFunction`, `renameFunction`, `createTrigger`, `dropTrigger` and `renameTrigger` have the Sequelize v6 names and argument order, so v6 migrations run unchanged.

<<< @/examples/schema-objects.ts#function-trigger{ts}

- **The function `body` is SQL you write.** It is wrapped in `BEGIN ... END;` like v6 and is not escaped: never build it from user input. The same holds for a `WHEN (...)` clause in the trigger options. See [Security](/security).
- A function name given as a string (`'touch_post'`, `'app.touch_post'`) is an unquoted identifier that folds to lower case, like v6. Use `{ name, schema }` for an exact, quoted name.
- Parameter and variable names and the language are identifier words. Types (`'integer'`, `'varchar(10)'`, `'text[]'`, `'SETOF users'`) and keywords (`'IMMUTABLE'`, `'SECURITY DEFINER'`, `'COST 10'`, `'FOR EACH ROW'`, `'DEFERRABLE'`) are checked against strict patterns and allowlists; anything else throws before SQL is sent.
- Trigger arguments are literals: `createTrigger(table, name, 'before', ['insert'], 'f', ['a', 1])` renders `EXECUTE FUNCTION f('a', 1)`. v6 rendered typed parameter declarations, which PostgreSQL rejects.
- New options: `dropFunction` / `dropTrigger` accept `ifExists` and `cascade`; `createTrigger` accepts `replace` (`CREATE OR REPLACE TRIGGER`, PostgreSQL 14+).
- Timing is `'before' | 'after' | 'instead_of' | 'after_constraint'` (a deferrable `CONSTRAINT TRIGGER`); events are `'insert' | 'update' | 'delete' | 'truncate'`.

## API reference

- [`QueryInterface`](/api/classes/QueryInterface)
