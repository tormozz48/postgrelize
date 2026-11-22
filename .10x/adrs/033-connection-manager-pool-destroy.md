# ADR-033: `connectionManager.pool` counters and `destroyConnection`

**Status:** Accepted (extends ADR-030)
**Date:** 2026-11-22
**Feature:** Sequelize v6 parity (connection manager)
**Author:** 10x-Team (Principal Architect)

## Context
ADR-030 made `getConnection` / `releaseConnection` public and left v6's `pool` and `destroyConnection` out. The production app that drove it (ddt) has two more consumers: a health check that reads `connectionManager.pool` (`size`, `available`, `using`, `waiting`, `maxSize`; v6 `sequelize-pool` `Pool` getters) and a report that holds a raw replica connection outside any query (`getConnection({ type: 'read' })`, `releaseConnection`, `destroyConnection` on a broken one). v6 `lib/dialects/abstract/connection-manager.js`: `getConnection` 168-210, `releaseConnection` 212-215, `destroyConnection` 216-219, `initPools` 74-166 (one `Pool` without replication; with replication an object with separate `read` / `write` pools and no totals).

## Decision
- `ConnectionManagerContract.pool: ConnectionPool` (read-only, live getters) and `destroyConnection(connection): Promise<void>`.
- `PoolCounters` maps the `pg` pool: `size = totalCount`, `available = idleCount`, `waiting = waitingCount`, `using = size - available`, `maxSize = options.max`. Only `src/connection` reads these; `pg` is not imported elsewhere.
- With replication `ConnectionPool` has the sums over the writer and all replica pools as its own counters (a health gauge keeps working unchanged), plus `read` (all replicas summed) and `write` (the v6 pool names). Without replication `read` / `write` are `undefined`.
- `destroyConnection` calls the pooled client's guarded `release(true)`: `pg` closes the client and removes it from the pool that owns it; the next acquisition opens a replacement. It is idempotent with `release`.
- `getConnection` accepts `type: 'SELECT'` as `'read'`. v6 runtime routes to a replica only for `'SELECT'` (`pool.acquire` line 112) while its typings document `'read'`; `sequelize.query` passes the query type. Accepting both keeps v6 callers working and makes the documented `'read'` work.

## Alternatives Considered
| Alternative | Pros | Cons | Why Not |
|---|---|---|---|
| Mirror v6 exactly: `pool.read` / `pool.write` only with replication, no top-level counters | Literal parity | A gauge written for the single-pool case reads `undefined` with replication | Totals cost nothing and break nobody; `read` / `write` are kept |
| Snapshot object per read of `pool` | Simple | Gauge code holding a reference sees stale numbers; v6 getters are live | v6 `pool` is live |
| Expose the `pg.Pool` | Most information | Leaks the driver into the public API and makes `pg` pool internals a contract | Counters are what v6 apps read |

## Consequences
### Positive
- Health gauges and raw replica connections migrate unchanged.
### Negative
- `pool` differs from v6 with replication (totals added, `read` sums several `pg` pools where v6 has one round-robin pool); documented.
- `minSize` is not provided.
### Risks
- `pg` counts a connecting client in `totalCount`; a gauge may see `using` rise slightly before the first query of a new connection runs.

## Dependencies
ADR-030, ADR-014 (replica routing), ADR-016.
