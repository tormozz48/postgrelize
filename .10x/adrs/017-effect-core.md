# ADR-017: Effect as the internal effect system

**Status:** Accepted (supersedes the "plain Promise functions" part of ADR-005 and the "no new runtime dependencies" rule of ADR-012 for `effect`)
**Date:** 2026-11-15
**Feature:** backlog 2 / S4
**Author:** 10x-Team (Architect + Staff Engineer)

## Context
The owner asked for a functional-programming core (monads, functors, pure functions). Effect gives typed
errors, resource safety (Scope / acquireRelease) and composition, which fit the connection and transaction
code where leaks and partial failures are the main risks. The public API must stay Sequelize v6 compatible.

## Decision
- Add `effect` (v4) as a runtime dependency.
- Effect programs at the I/O edges (connection manager, transactions, COPY, notifications); pure functions
  for SQL building and row mapping (already functional, AST-based).
- The class shell calls `Effect.runPromise` once per public method. Error channel types are the existing v6
  error classes.
- `postgrelize/effect` exposes Effect-returning operations for Effect users; separate build entry.
- Performance budget enforced by `bench/compare.ts` (geomean ≤ +10%, no case > +20%) on the stub benchmark.

## Alternatives Considered
| Alternative | Pros | Cons | Why Not |
|---|---|---|---|
| Rambda + own Result/Option | tiny, no runtime | no resource safety or typed effects; owner chose Effect | superseded by owner decision |
| fp-ts | mature typeclasses | maintenance mode (merged into Effect) | dead end |
| Effect everywhere incl. row mapping | uniform | 0.3–1 µs per run, per-row costs explode | performance budget |

## Consequences
### Positive
- Client / transaction release guaranteed on failure and interruption; typed failures; Effect users compose natively.
### Negative
- Larger dependency (`effect` package); two styles in the code base (Effect at edges, pure functions inside).
### Risks
- Overhead on tiny queries: mitigated by one runtime entry per public call and the benchmark gate.
- Effect 4 API churn: pinned major, isolated in `src/connection`, `src/transaction`, `src/effect`.

## Dependencies
- ADR-005 (class shell stays), ADR-012 (connection features), ADR-014 (replica routing in the connection manager).
