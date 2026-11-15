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
`statementTimeout?: number` (ms, non-negative integer) in query options of `sequelize.query` and model finders/writers that take `transaction`-like execution options. Mechanism: the timeout is applied with `SELECT set_config('statement_timeout', $1, true)` inside the transaction that already runs the query; outside a transaction the query runs in an implicit single-statement transaction block `BEGIN; set_config(..., true); <query>; COMMIT` on the pooled client, so the value never leaks to pooled connections. The value is bound (`$1`), validated as a non-negative integer.

Decision to keep the surface small: the option is on `ExecuteOptions` and the `QueryOptionsBase` shared by raw and model queries; the connection layer owns the wrapping.

### Bulk insert via `UNNEST`
`bulkCreate(records, { unnest: true })` (opt-in). Compiles `INSERT INTO t (cols) SELECT * FROM unnest($1::type[], $2::type[], …)`, one array parameter per column, so the 65535-parameter limit no longer caps batch size. Column types come from the model's DataTypes (allowlisted SQL types). Falls back to the VALUES path (not an error) when a row needs `DEFAULT` for some columns in only some rows is NOT supported: such rows raise a plain `Error` naming the column. Values are bound, array parameters go through `pg` array serialisation. Default path unchanged.

## Docs and checks
Guide pages (performance, sessions/transactions, bulk-writes), executed example regions, matrix rows → `supported`, README list, `docs/security.md` rows for `deferrable`, `statementTimeout`, `unnest`, payload tests under `tests/integration/security/`.
