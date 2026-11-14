# ADR-012: Connection-level features without extra dependencies

**Status:** Accepted · **Date:** 2026-11-14 · **Feature:** postgres-power (P1-C) · **Author:** 10x-Team (Architect + SRE)

## Context
Streaming, LISTEN/NOTIFY, COPY and advisory locks require holding a dedicated connection; `pg` has no built-in COPY streaming (usually `pg-copy-streams`).

## Decision
- Cursors: `DECLARE ... NO SCROLL CURSOR` inside a (managed or caller's) transaction + `FETCH n`, exposed as an async iterator that always closes the cursor and releases the client.
- LISTEN/NOTIFY: one dedicated pooled-out client per Sequelize instance, created lazily, re-subscribes after reconnect; `notify` uses `pg_notify($1, $2)` (bound).
- COPY: use `pg`'s low-level `client.query` with a Submittable implementing the COPY sub-protocol (`CopyIn`/`CopyOut` messages via `connection.sendCopyFromChunk`/`endCopyFrom`), text format with proper escaping — no new runtime dependency. If the low-level API is unavailable, fall back with a clear error.
- SET LOCAL: `set_config(name, value, true)` with bound parameters right after BEGIN (no string interpolation).
- Advisory locks: `pg_advisory_xact_lock($1)` / `pg_try_advisory_xact_lock($1)` (bigint keys or hashed strings via `hashtext`).

## Alternatives Considered
| Alternative | Pros | Cons | Why Not |
|---|---|---|---|
| `pg-copy-streams` dependency | Proven | Extra dep, CJS-only, stream API | Keep deps minimal; feasible natively |
| `pg-cursor` | Proven | Extra dep | SQL cursors are enough |

## Consequences
+ No new dependencies. − COPY relies on `pg` internals (`client.connection`); covered by integration tests on every PG version in CI.
