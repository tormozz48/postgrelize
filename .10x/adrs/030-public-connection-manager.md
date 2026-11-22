# ADR-030: Public `sequelize.connectionManager` (`getConnection` / `releaseConnection`)

**Status:** Accepted
**Date:** 2026-11-22
**Feature:** Sequelize v6 parity (connection routing)
**Author:** 10x-Team (Principal Architect)

## Context
Sequelize v6 exposes `sequelize.connectionManager`. Every query (`lib/sequelize.js` `query`, lines 305 and 319), every transaction (`lib/transaction.js` `prepareEnvironment` line 82 and `cleanup` line 122) and `sync` acquire a connection with `connectionManager.getConnection(options)` and give it back with `connectionManager.releaseConnection(connection)`. Applications replace both methods on the instance to route connections: a production app (ddt) picks one of several databases per request from an `AsyncLocalStorage` value by delegating to another `Sequelize` instance's manager. postgrelize 1.1.0 had an internal `ConnectionManager` (ADR-012) that took clients straight from the pool and called `client.release()` in four places, and `connectionManager` was on the API-surface allow-list as `internal`.

## Decision
- `Sequelize#connectionManager` is a typed, read-only getter returning the instance's `ConnectionManager`, exposed as the interface `ConnectionManagerContract`: `getConnection(options?: { type?: 'read' | 'write'; useMaster?: boolean; uuid?: string }): Promise<Connection>` and `releaseConnection(connection): Promise<void> | void`. `Connection` is the pooled `pg` client (`Pick<PoolClient, 'query' | 'release'>`).
- `ConnectionManager.getConnection` picks the pool (`type: 'read'` uses the next replica unless `useMaster`) and replaces `acquire()`; `releaseConnection` calls `connection.release()`.
- Everything that takes or returns a pooled connection calls `this.getConnection` / `this.releaseConnection` on the manager at call time: `execute`, `Transaction.begin` / `commit` / `rollback` / abort, and `CopyRunner` (through callbacks). Replacing the methods on the instance therefore routes every path, including `findEach`, advisory locks and `sync`, which run through `execute` or a transaction.
- A foreign connection (from another instance's manager) works here: queries only need `query`, and `release()` returns it to the pool that created it. The guard that wraps `release` is idempotent, so a wrapper that calls both its owner's and the default `releaseConnection` does not corrupt a pool.
- `LISTEN` keeps its dedicated non-pooled connection (`ConnectionManager.dedicated`): it is long lived, v6 has no `LISTEN`, and holding a pool slot for it would change pool sizing. It is not routed; documented.
- `options.uuid` is passed for transactions and is informational (v6 uses it to key pool resources). v6's `type: 'SELECT'` for read-only transactions is not mapped: transactions always use the writer.
- Only the two methods are public. v6's `pool`, `destroyConnection`, `initPools`, `close`, `refreshTypeParser` stay unprovided.

## Alternatives Considered
| Alternative | Pros | Cons | Why Not |
|---|---|---|---|
| Hook events (`beforePoolAcquire`) | No manager object | Cannot substitute the connection | Does not cover the routing use case |
| Routing option on the constructor | Typed, declarative | New API that v6 apps do not have; ddt would have to rewrite | v6 monkey-patching is the contract to keep |
| Expose the whole internal `ConnectionManager` class | Less code | Makes `execute`, `close`, `dedicated` public API | Locks internals; the contract interface exposes only what v6 apps use |

## Consequences
### Positive
- v6 apps that route connections by patching the manager migrate unchanged.
- One acquire/release seam for tests and instrumentation.
### Negative
- A wrapper that never releases leaks a connection, as in v6; documented.
- `execute` awaits `releaseConnection` (async-capable), one extra microtask per query; the bench gate was not re-run (see PR).
### Risks
- A future code path that calls `client.release()` directly would bypass routing. `tests/integration/connection-manager.test.ts` covers query, finders, transactions, `findEach`, COPY, advisory locks and `sync`.

## Dependencies
ADR-012 (connection features), ADR-014 (replica routing), ADR-016 (v6 parity).
