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

## Views and materialized views

<<< @/examples/schema-objects.ts#views{ts}

- `createView(name, query, { replace, temporary, recursive, columns, checkOption, securityBarrier, securityInvoker })`, `dropView(name, { ifExists, cascade })`.
- `createMaterializedView(name, query, { ifNotExists, columns, using, withData })`, `refreshMaterializedView(name, { concurrently, withData })`, `dropMaterializedView(name, { ifExists, cascade })`. PostgreSQL has no `OR REPLACE` for materialized views. `concurrently` needs a unique index on the view and cannot be combined with `withData: false`.
- **The `query` is SQL you write.** It is not escaped: never build it from user input. See [Security](/security). View and column names are quoted identifiers.
- A model can read a view like a table (`freezeTableName` or `tableName`, `timestamps: false`).
- A `temporary` view lives only as long as its database session, which is one pooled connection: create and use it in one transaction (`transaction` option).

## Row-level security

<<< @/examples/schema-objects.ts#rls{ts}

- `enableRowLevelSecurity(table, { force })` and `disableRowLevelSecurity(table, { noForce })`. `force` also subjects the table owner to the policies; superusers and roles with `BYPASSRLS` are never subject to them.
- `createPolicy(table, name, { command, kind, roles, using, withCheck })`: `command` is `'all'` (default), `'select'`, `'insert'`, `'update'` or `'delete'`; `kind` is `'permissive'` (default) or `'restrictive'`; `roles` are role names or `'public'`, `'current_user'`, `'current_role'`, `'session_user'`.
- `alterPolicy(table, name, { roles, using, withCheck, rename })`, `dropPolicy(table, name, { ifExists, cascade })`.
- **A string condition is SQL you write**: not escaped, never build it from user input. A where object (`{ edits: { [Op.gt]: 0 } }`) compiles like a partial-index condition and its values are escaped as literals. See [Security](/security).
- Policies usually read a per-request setting. Set it with the `settings` option of a transaction ([Sessions](/guide/sessions)) and refer to it with `current_setting('app.tenant_id')::int`.

## API reference

- [`QueryInterface`](/api/classes/QueryInterface)
