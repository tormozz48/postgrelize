# ADR-031: The `retry` option, implemented in-house

**Status:** Accepted
**Date:** 2026-11-22
**Feature:** Sequelize v6 parity (`Options.retry`)
**Author:** 10x-Team (Principal Architect)

## Context
Sequelize v6 accepts `retry` on the constructor and on `sequelize.query` (`lib/sequelize.js`, merged with `__spreadValues(__spreadValues({}, this.options.retry), options.retry)` at line 299, whole query including `getConnection` wrapped in `retry-as-promised` at 300-322). The v6 default `{ max: 5, match: ['SQLITE_BUSY: database is locked'] }` retries nothing on PostgreSQL, but apps that migrate to postgrelize set `retry: { max, match: [/SequelizeConnectionRefusedError/, ...] }` to survive database restarts, so the option and the v6 error names must work. `retry-as-promised` is not a dependency of postgrelize and AGENTS.md rule 3 forbids new runtime dependencies without an ADR.

## Decision
- Implement the ~100 lines of `retry-as-promised` we need in `src/connection/retry.ts` (`RetryRunner`), with identical semantics: a retry happens when an attempt fails, `current < max` (no `max`: no retry), and `match` is empty or an entry matches. Entries: function (tried with `instanceof`, called as a predicate when `instanceof` throws, i.e. for arrow functions), string equal to `error.message` or `error.toString()`, regular expression tested against both. Delay `backoffBase * backoffExponent ** (attempt - 1)` (defaults 100 and 1.1) with optional jitter; `timeout` rejects an attempt with a `TimeoutError` (`previous` holds the earlier error); `name` and `report` as in v6.
- `RetryOptions` (same fields as v6's `RetryOptions`) on `SequelizeOptions`, `QueryOptionsBase` (so on `query`, finders, writes) and `TransactionOptions`. The per-call option is merged over the instance option with a shallow spread, as in v6. No default: when neither is set the code path is the old one (no closure, no allocation).
- Retried: `SequelizeInternals.execute` (connection acquisition plus statement) when the call has no transaction client; `Transaction.begin` for a top-level transaction (connection acquisition plus `BEGIN` and the settings statements; a failed attempt rolls back and releases its connection before the next one). The callback of a managed transaction is not part of the retried unit.
- Not retried: any statement that runs on a transaction's connection (including savepoints, `COMMIT`, `ROLLBACK`), because PostgreSQL has aborted the transaction; COPY (streams cannot be replayed); `listen`.
- The connection error classes already carry the v6 names, which a unit test now pins.

## Alternatives Considered
| Alternative | Pros | Cons | Why Not |
|---|---|---|---|
| Depend on `retry-as-promised` | Identical behaviour, no code | A runtime dependency for ~100 lines, rule 3 | The logic is small and fully covered by unit and v6-differential tests |
| Retry statements inside transactions like v6 | Literal parity | The retry runs on an aborted transaction and cannot succeed; it can also repeat a statement whose first run reached the server | A connection-level failure in a transaction needs the whole transaction replayed by the application |
| Retry only connection errors, ignore `match` | Safer | Diverges from the v6 contract (`match` of any error, empty `match` retries all) | The option is a v6 contract |

## Consequences
### Positive
- v6 `retry` configurations work unchanged; a differential test compares attempt counts with `sequelize@6` for no retry, matching, non-matching, per-query merge and missing `max`.
- No new dependency; zero overhead when unset.
### Negative
- An empty `match` retries every error, including constraint violations (v6 does the same); documented prominently.
- A timed out attempt is abandoned, not cancelled: its connection work finishes in the background.
### Risks
- Retrying a non-idempotent statement whose first attempt reached the server can run it twice. The user chooses `match`; the docs say so.

## Dependencies
ADR-030 (connection manager: acquisition goes through `getConnection`), ADR-016 (v6 parity), AGENTS.md rule 3.
