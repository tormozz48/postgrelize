# ADR-014: Read replica routing in the connection layer

**Status:** Accepted · **Date:** 2026-11-14 · **Feature:** postgrelize-mvp (v6 compat) · **Author:** 10x-Team (Architect + SRE)

## Context
Sequelize v6 supports `replication: { read, write }` and routes SELECTs to readers. Our executor knew nothing about query kinds.

## Decision
`ConnectionManager` owns a writer pool and N reader pools. `execute(query, { route: 'read' })` picks the next reader round-robin; any explicit client (transaction) or `useMaster` forces the writer. Callers mark reads: model finders, `count`/aggregates, `copyTo`, and `sequelize.query` with an effective SELECT type. Read-after-write consistency is the caller's concern (same as v6): use `useMaster: true` or a transaction.

## Alternatives Considered
| Alternative | Pros | Cons | Why Not |
|---|---|---|---|
| Separate Sequelize instance for reads | No routing code | Not v6 compatible; duplicates models | Drop-in requirement |
| Parse SQL to detect SELECT | Works for raw SQL without type | Fragile (CTEs with DML, functions with side effects) | v6 uses the declared query type |

## Consequences
+ v6-compatible configuration and routing. − Replica lag visible to reads (documented); reader failure surfaces as connection errors (no automatic failover, same as v6).
