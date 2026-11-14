# ADR-009: Eager loading via v6-compatible JOIN strategy

**Status:** Accepted · **Date:** 2026-11-14 · **Feature:** postgrelize-mvp (M4) · **Author:** 10x-Team (Architect + DBA)

## Context
`include` must behave exactly like Sequelize v6 for drop-in users: result shapes (`raw: true` flattened keys, nested instances), duplicated-row semantics of `count` with includes, `subQuery` behaviour with `limit`. PostgreSQL offers a better strategy (`LEFT JOIN LATERAL (SELECT json_agg(...))`) that avoids row explosion.

## Decision
Implement the v6 JOIN strategy as the default and only strategy in M4: one SELECT with joins, `"<path>.<attr>"` column aliases, PK-based de-duplication into instance trees, main-model subquery for `limit` with multi includes, `separate: true` second query. Pure modules: include normalization → join/AST builder → row tree assembler.

## Alternatives Considered
| Alternative | Pros | Cons | Why Not now |
|---|---|---|---|
| LATERAL + json_agg | No row explosion, correct limits per parent, nested limit/order | Different raw shapes; JSON loses types (bigint precision, dates) → re-parse; diverges from v6 | Breaks drop-in; keep as opt-in P1 extension |
| Always separate queries (dataloader style) | Simple, no dedupe | Many round trips, `required`/`where` across includes impossible in one query | Not v6 behaviour |

## Consequences
+ Differential-testable parity with v6. − Row explosion on wide includes (same as v6). Risk: v6 subQuery edge cases (required + limit + order on include) — covered by differential scenarios; unsupported combinations throw explicitly instead of producing wrong SQL.

## Dependencies
ADR-001, ADR-005.
