# ADR-023: Opt-in named prepared statements

**Status:** Accepted · **Date:** 2026-11-15 · **Feature:** S10 performance (spec item #10) · **Author:** Claude (Architect)

## Context
Every query is sent as an unnamed statement, so PostgreSQL parses and plans it on every call. For hot, small, repeated queries (`findByPk`, counts, single-row writes) this server-side work is a noticeable share of the round trip. `pg` supports named statements (`query({ name, text, values })`): the first use on a connection runs Parse, later uses on the same connection skip it. Named statements are per connection, live until the connection closes, and are incompatible with poolers in transaction mode (PgBouncer without protocol-level prepared statement support).

## Decision
- New Sequelize option `statementCache`, **off by default**: `statementCache: true` or `{ max?: number }` (default max 100 per connection). Nothing changes for users who do not set it (v6 semantics, SQL text, ADR-002 bound parameters unchanged).
- `ConnectionManager.execute` adds `name` to the `pg` query config when the cache is on. The name is `pgz_` + the first 16 hex chars of the SHA-256 of the SQL text, so equal text always gets the same name and different text a different one (a collision would need a 64-bit hash clash on texts of one connection; the cache also stores the text per name and falls back to unnamed on a mismatch).
- The cache is bounded and does not rely on `pg` internals: each pooled client keeps a `Map<name, text>` (held in a `WeakMap` keyed by the client). A statement is named only while the map has fewer than `max` entries and its text is at most 8 192 characters; every other statement stays unnamed. No eviction, no `DEALLOCATE`; statements die with the connection (pool `maxUses` / `idle` recycle them).
- Statements run through `client`s given explicitly (transactions) use the same path. COPY, LISTEN/NOTIFY and cursors (`DECLARE`) are never named.
- When PostgreSQL rejects a named statement with `0A000` "cached plan must not change result type" (a column set changed after DDL), `execute` retries the same query once as unnamed outside a transaction; inside a transaction the error is mapped and thrown like any other.
- Values are still sent as `$n` parameters; the name derives from the text only, so no user value reaches a statement name (ADR-020 unaffected, no new row in the security table beyond a note).
- Documented: not for PgBouncer transaction pooling; pair with a bounded `pool.max`. Matrix row *Named prepared statements* moves to `supported` with an integration test; `docs/guide/performance.md` gets a section.

## Alternatives Considered
| Alternative | Pros | Cons | Why Not |
|---|---|---|---|
| Name every statement, default on | Maximum gain | Unbounded server memory with dynamic SQL (`IN` lists); breaks transaction-mode poolers; schema-change errors for everyone | Too risky as a default |
| LRU with `DEALLOCATE` and deleting `connection.parsedStatements` | Bounded and adaptive | Relies on `pg` internals; extra round trips on eviction | Fixed cap is simpler and safe |
| Template cache of compiled SQL (spec #11) | Saves client-side compile time too | High risk (ADR-020), complex invalidation | Deferred; independent of this decision |

## Consequences
+ Hot repeated queries skip server parse/plan when enabled; zero effect when disabled.
+ Bounded server memory (`max` statements per connection).
− Texts beyond the cap or dynamic texts stay unnamed, so gains depend on workload; the benefit is only measurable against a real database (stub mode cannot show it).
− The retry on `0A000` adds one code path that needs a DDL-change integration test.
