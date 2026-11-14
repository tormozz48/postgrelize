# ADR-004: Differential testing against sequelize@6

**Status:** Accepted
**Date:** 2026-11-14
**Feature:** postgrelize-mvp
**Author:** 10x-Team (Architect + Staff Engineer)

## Context
"Drop-in compatible" must be provable, not asserted.

## Decision
`sequelize@6` + `pg` as devDependencies. `tests/compat` runs each scenario `(lib) => Promise<unknown>` on both libs in fresh schemas of the same PG and asserts deep equality of normalized results (instances → `toJSON()`, errors → `{ name, fields }`). Plus own unit (no DB) and integration suites. Compatibility is claimed only for covered scenarios.

## Alternatives Considered
| Alternative | Pros | Cons | Why Not |
|---|---|---|---|
| Port Sequelize test suite | Max coverage | Thousands of mocha/sinon tests, many dialect-specific/SQL-string assertions | Cost; asserts SQL text we deliberately change |
| Own tests only | Fast | Compat unproven | Fails success criterion |

## Consequences
### Positive
- Real behavioural oracle; catches hidden v6 behaviours.
### Negative
- Tests need a live PG; slower than unit.
### Risks
- Nondeterministic values (timestamps, ids) → normalization helper.

## Dependencies
ADR-001.
