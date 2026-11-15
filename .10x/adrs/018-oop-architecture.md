# ADR-018: Object-oriented architecture, no Effect

**Status:** Accepted (supersedes ADR-005 "functional core, thin class shell" and ADR-017 "Effect as internal effect system")
**Date:** 2026-11-15
**Feature:** backlog 2 / architecture
**Author:** 10x-Team (Architect + Staff Engineer)

## Context
The owner stopped the Effect migration after step 4 and asked to remove Effect and rewrite the code in an
object-oriented style, with everything as classes. The public API must stay Sequelize v6 compatible.

## Decision
- Remove the `effect` dependency and the `postgrelize/effect` entry point (breaking, released as 0.8.0).
- Behaviour lives in classes with single responsibilities and constructor injection; plain data (AST nodes,
  option bags, constant tables, `Op`) stays as TypeScript types / frozen objects.
- Public v6 helper functions remain as factories returning class instances; `Model` / `Sequelize` remain facades.
- Async code uses async/await; resource safety via try/finally inside the owning class
  (`ConnectionManager`, `TransactionRunner`), keeping the fixes found during S4 (rollback + release when a
  transaction fails to start, release on failure).

## Alternatives Considered
| Alternative | Pros | Cons | Why Not |
|---|---|---|---|
| Keep the functional core, only remove Effect | small diff | not what the owner asked | owner chose full OOP |
| Classes for data too (AST node classes) | uniform | allocation and boilerplate for immutable data, no behaviour to encapsulate | YAGNI |
| Keep `postgrelize/effect` as a deprecated wrapper | softer upgrade | keeps the dependency | owner chose removal |

## Consequences
### Positive
- Familiar structure for contributors coming from Sequelize (association classes, data type classes).
- One way to write code across the code base.
### Negative
- Large one-time rewrite; history of the functional design is in ADR-005 / ADR-017.
- Breaking change for `postgrelize/effect` users (0.7.0 only).
### Risks
- Regressions: unchanged test assertions + differential suite; performance gate.

## Dependencies
- ADR-002 (AST compile), ADR-009 (include strategy), ADR-014 (replicas), ADR-016 (bug-fix policy) unchanged.
