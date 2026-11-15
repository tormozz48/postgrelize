# S16 Session and write extras — design

**Date:** 2026-11-15 · **Backlog:** 4, stage 5 · **Scope:** `src/connection/`, `src/transaction/`, the bulk-insert path.

Four matrix rows, two PRs. v6 semantics never change; everything is opt-in.

## PR 1 — Named prepared statements (ADR-023, as accepted)

- `statementCache?: boolean | { max?: number }` on `SequelizeOptions`; off by default.
- `StatementCache` (`src/connection/statement-cache.ts`) is used by `ConnectionManager.execute`. Per client (`WeakMap`) it keeps `Map<name, text | null>`.
- Name: `pgz_` + first 16 hex of SHA-256 of the SQL text. Named only when the text starts with SELECT / INSERT / UPDATE / DELETE / WITH, has no `;` (multi-statement texts cannot be prepared), is at most 8192 characters, and the map holds fewer than `max` entries. Entry is recorded after the statement succeeded. A text mismatch for a name falls back to unnamed.
- COPY, LISTEN/NOTIFY, cursors, DDL and transaction control never reach the cache or are not eligible by the pattern.
- Stale plan (`cached plan must not change result type`): outside a transaction (pooled client, no `client` option) retried once unnamed; inside a transaction thrown. In both cases the entry becomes `null` (poisoned), so that text is unnamed on that connection afterwards. This detail is an implementation of the ADR's "no DEALLOCATE" rule; it avoids repeated failing round trips.
- Replicas: caches are per client, so every pool (writer, readers) has its own bound.
- `max` must be a positive integer, else the constructor throws.
- Tests: unit (`statement-cache`), integration (`pg_prepared_statements`, bound, DDL change retry, transaction error, parse error), security payloads, bench case `findByPk statementCache`.

## PR 2 — Transaction and write extras

### `DEFERRABLE` transaction mode
`TransactionOptions.deferrable?: boolean`. Renders `START TRANSACTION … [NOT] DEFERRABLE`. PostgreSQL only honours it for `SERIALIZABLE READ ONLY`; the option is passed through and PostgreSQL ignores it otherwise. Booleans only (anything else throws), so it is not a user-text input. Ignored for savepoints.

### Per-query statement timeout
`statementTimeout?: number` (ms, non-negative safe integer) on `QueryOptionsBase`, so it reaches `sequelize.query`, finders and writers; `ExecuteOptions.statementTimeout` carries it to `ConnectionManager`. `StatementTimeout` (`src/connection/statement-timeout.ts`) wraps the one query: outside a transaction `BEGIN; set_config('statement_timeout', $1, true); <query>; COMMIT` on the pooled client (rollback on error), so nothing leaks to the pool; inside a transaction it reads `current_setting('statement_timeout')`, sets the value, runs the query and restores the previous value (best effort, the transaction may be aborted). The value is bound and validated; other values throw before any SQL. Cost: 2–3 extra round trips, only when the option is set.

### Bulk insert via `UNNEST`
`bulkCreate(records, { unnest: true })` (opt-in). `BulkInsertBuilder` picks the VALUES path (unchanged) or `UnnestInsertBuilder`, which compiles `INSERT INTO t (cols) SELECT * FROM unnest($1::type[], …) RETURNING …`, one array parameter per column; column types are the model's DataType `sqlType`. Not supported (plain `Error`): conflict options (`ignoreDuplicates`, `updateOnDuplicate`, `onConflict`), `ARRAY` columns (unnest would flatten them), and rows that leave a column to its `DEFAULT` (NULL would override the default). The SQL AST has no function in FROM yet (S12 adds it, ADR-024), so the builder compiles an INSERT … SELECT from a placeholder table and swaps the placeholder for the `unnest(...)` call; move it onto the `function` FromItem after S12 lands.

## Docs and checks
Guide pages (performance, sessions/transactions, bulk-writes), executed example regions, matrix rows → `supported`, README list, `docs/security.md` rows for `deferrable`, `statementTimeout`, `unnest`, payload tests under `tests/integration/security/`.
