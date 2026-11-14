# ADR-016: Fix inherited Sequelize v6 bugs by default, track divergences explicitly

**Status:** Accepted
**Date:** 2026-11-14
**Feature:** backlog 2 / S2
**Author:** 10x-Team (Architect + Staff Engineer)

## Context
postgrelize promises drop-in v6 behaviour, verified by a differential suite. The issue review found v6 bugs
that postgrelize copied (wrong SQL, wrong results). The owner chose to fix them by default.

## Decision
- Inherited v6 bugs are fixed by default. Each fix has a regression test that asserts the correct behaviour
  (integration test, not differential).
- Differential tests never encode a v6 bug as expected: a scenario that hits a fixed bug is moved out of the
  differential suite (or narrowed) and listed in `docs/sequelize-issues.md`.
- Parity regressions (postgrelize worse than v6) are fixed to match v6 and covered by differential tests.
- No opt-out flag (YAGNI); revisit only on user demand.

## Alternatives Considered
| Alternative | Pros | Cons | Why Not |
|---|---|---|---|
| Opt-in fixes (`fixes: true`) | maximal compatibility | two code paths, untested combinations | owner chose fix-by-default |
| Fix only crashes | no behaviour change for working apps | leaves wrong results in place | weaker value proposition |

## Consequences
### Positive
- Correct PostgreSQL behaviour; clear record of every difference from v6.
### Negative
- Apps that rely on a v6 bug may need changes when migrating.
### Risks
- Silent divergence: mitigated by the public list and per-fix regression tests.

## Dependencies
- Differential test helpers (`tests/support/compat.ts`); S3 docs site hosts the list.
