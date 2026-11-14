# ADR-011: Subqueries as first-class expressions

**Status:** Accepted · **Date:** 2026-11-14 · **Feature:** postgres-power (P1-A/B) · **Author:** 10x-Team (Architect + Staff Engineer)

## Context
CTE-like composition, `EXISTS`, `IN (SELECT ...)`, `INSERT ... SELECT`, `UPDATE ... FROM` and `MERGE ... USING` all need a SELECT that is built from model find options but embedded into another statement. Sequelize v6 only offers `literal()` for this (no binding, no typing).

## Decision
`Model.subquery(findOptions)` returns an immutable `Subquery` expression (new `methodKind: 'subquery'`) holding the model and normalized options. It is compiled lazily by the same select builder as `findAll` (scopes, paranoid, include all apply), so values stay bound parameters of the outer statement. Builders `exists`, `over`, `tuple` follow the same pattern (pure data + compiler case). CTE (`WITH`) is postponed: subqueries cover the use cases without a second naming scope (YAGNI).

## Alternatives Considered
| Alternative | Pros | Cons | Why Not |
|---|---|---|---|
| Fluent query builder | Very expressive | Second API paradigm next to v6 options | Inconsistent with drop-in style |
| `literal()` + manual SQL | No new API | No bound params, injection-prone | Against ADR-002 |
| `with` option (CTE) | Mirrors SQL | Rarely needed beyond subqueries; extra scoping rules | YAGNI |

## Consequences
+ One composable primitive reused by P1-A/B. − Subquery compilation needs the model runtime → expression kinds resolved through a registry injected at compile time (no import cycle).
