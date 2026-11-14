# ADR-013: CTE options and COPY TO with inlined literals

**Status:** Accepted · **Date:** 2026-11-14 · **Feature:** postgres-power · **Author:** 10x-Team (Architect + Security)

## Context
ADR-011 postponed CTEs. Recursive queries (trees, graphs) need `WITH RECURSIVE` plus a way for the recursive step to reference the CTE. Exports need `COPY ... TO STDOUT`, which does not accept bind parameters.

## Decision
1. CTEs are plain options (`with`, `source`, `from`) on find options and subqueries; the select AST gains `with`, `extraFrom` and a `union` node. The recursive step is an ordinary subquery whose `from` names the CTE.
2. `copyTo` compiles the SELECT normally, then inlines values with ADR-010 `escapeLiteral` (the same audited path as DDL), wraps it in `COPY (...) TO STDOUT WITH (...)` with allow-listed options, and streams raw chunks through a `pg` submittable.

## Alternatives Considered
| Alternative | Pros | Cons | Why Not |
|---|---|---|---|
| Fluent `cte()` builder | Reads like SQL | Second API style | Inconsistent with options-based API |
| `copyTo` returning instances | Typed rows | Needs OID-based text parsing; duplicates `findEach` | YAGNI |
| Temporary prepared statement for COPY | Keeps params | COPY cannot reference parameters at all | Not possible |

## Consequences
+ Tree queries and fast exports without raw SQL. − A second code path inlines values (DDL + COPY TO); covered by escaping tests.
