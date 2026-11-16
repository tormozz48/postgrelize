# S11 DDL objects — design

Backlog 4, stage S11. Decisions: [ADR-025](../adrs/025-ddl-object-names-and-trusted-sql.md). Matrix rows: Extensions, Sequences, Views and materialized views, Functions and triggers, Row-level security policies, UNLOGGED and TEMPORARY tables. Options are new; v6 semantics unchanged. Everything is on `QueryInterface` unless noted; names are `string | { tableName, schema }` (`TableName`) except functions (`string | { name, schema }`).

## Delivery: one PR per topic
1. Extensions and sequences.
2. Functions and triggers (v6 parity, differential tests).
3. Views and materialized views.
4. Row-level security.
5. UNLOGGED and TEMPORARY tables (`createTable` options, `Model.init` options, `sync`).

Each PR carries TSDoc with `@example`, guide section with executed `docs/examples/schema.ts` regions, security table rows plus payload tests in `tests/integration/security/`, matrix row, README line, `llm:build` if needed, `status.md`.

## API
- `createExtension(name, { ifNotExists?, schema?, version?, cascade? })`, `dropExtension(name, { ifExists?, cascade? })`.
- Sequences: `createSequence(name, { dataType?: 'smallint'|'integer'|'bigint', start?, increment?, minValue?, maxValue? (`false` → NO MIN/MAXVALUE), cache?, cycle?, ownedBy?: { table, column } | null, ifNotExists? })`, `alterSequence(name, { restartWith?, increment?, minValue?, maxValue?, cache?, cycle?, ownedBy?, ifExists? })`, `dropSequence(name, { ifExists?, cascade? })`, `nextval(name)` and `setval(name, value, isCalled = true)` (bound `regclass` text, return `string` to keep bigint exact).
- v6 names: `createFunction(name, params, returnType, language, body, optionsArray?, { variables?, force?, ...query })`, `dropFunction(name, params, options?)`, `renameFunction(old, params, new, options?)`, `createTrigger(table, name, timing, events, functionName, functionArgs, optionsArray?, options?)`, `dropTrigger`, `renameTrigger`. Params `{ type, name?, direction? }`; timing `before|after|instead_of|after_constraint`; events `insert|update|delete|truncate`.
- Views: `createView(name, query, { replace?, columns?, temporary?, recursive?, checkOption?, securityBarrier?, securityInvoker? })`, `dropView`, `createMaterializedView(name, query, { columns?, using?, withData?, ifNotExists? })`, `refreshMaterializedView(name, { concurrently?, withData? })`, `dropMaterializedView`.
- RLS: `enableRowLevelSecurity(table, { force? })`, `disableRowLevelSecurity(table, { noForce? })`, `createPolicy(table, name, { command?, kind?, roles?, using?, withCheck? })`, `alterPolicy`, `dropPolicy`.
- Tables: `unlogged`, `temporary` on `createTable` options and Model options.

## Testing
Unit: generated DDL per method incl. rejection of bad input. Compat (v6 has them): functions and triggers, executed on both libraries with the same call, same observable behaviour (function result, trigger effect, catalog rows). Integration: real PG, version gates for PG-specific options (`securityInvoker` ≥15 ok on 16+; none gated yet). Security: PAYLOADS and fast-check identifier properties per input in `withCanary`.
