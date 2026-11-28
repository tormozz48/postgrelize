# ADR-039: Two-key and session advisory locks, row-lock table aliases

**Status:** Accepted
**Date:** 2026-11-28
**Feature:** ddt migration (locking)
**Author:** 10x-Team (Architect)

## Context
ddt keeps about 30 lock sites in raw SQL: `pg_advisory_xact_lock(int4, int4)` and `FOR ... OF alias`. `transaction.advisoryLock` took one key only, and `lock.of` took one model. ddt also runs a lock-ordering guard in a global `beforeFind` hook that treats every `options.lock` as a row lock.

## Decision
- `advisoryLock` / `tryAdvisoryLock` accept two `int4` keys, passed unhashed. The one-key statements are unchanged, so existing lock identities are too.
- `{ session: true }` uses `pg_advisory_lock`; `advisoryUnlock` releases early. When the outermost transaction ends, `pg_advisory_unlock_all()` runs before the connection returns to the pool; a connection that fails to run it is destroyed.
- `lock.of` accepts a model, an alias string or a list. An empty list throws, because without `OF` PostgreSQL locks every table.
- `lock.skipOrderGuard` is an inert marker for application hooks. postgrelize has no ordering guard.

## Rejected
- A separate `rowLock` option: hooks that read `options.lock` would silently miss it.
- Session locks that outlive the transaction: the connection goes back to the pool and the lock would leak to an unrelated caller. A lock that must span transactions needs a dedicated connection, which nothing needs yet.

## Consequences
- Session locks last at most as long as the outermost transaction.
- `Model.subquery` runs no hooks, so application guards never see a lock inside a subquery.
