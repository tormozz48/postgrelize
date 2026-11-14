# ADR-001: Clean-room TypeScript ORM, Sequelize v6 drop-in, PostgreSQL-only

**Status:** Accepted
**Date:** 2026-11-14
**Feature:** postgrelize-mvp
**Author:** 10x-Team (Architect + Staff Engineer)

## Context
Users need Sequelize v6 compatibility (no app rewrite) and deep PostgreSQL features that v6's multi-dialect query generator cannot express (expression-based ON CONFLICT, DO UPDATE WHERE, ON CONSTRAINT, later CTE/MERGE/COPY).

## Decision
Write a new TypeScript implementation of the Sequelize v6 public API (reference 6.37.x) targeting only PostgreSQL. Internal architecture is our own: Query AST → PG compiler → `pg` executor. PG features are added as new options/methods only (additive), never by changing v6 semantics.

## Alternatives Considered
| Alternative | Pros | Cons | Why Not |
|---|---|---|---|
| Fork Sequelize v6 | Compatibility day one | ~40k LOC legacy JS, abstract-dialect design, TS conversion ≈ rewrite | Debt blocks the PG-depth goal |
| Plugin over Sequelize v6 | Fast | Coupled to internals, cannot change query generator | Doesn't solve "best PG support" |
| Target v7 API | Modern TS API | Not drop-in for the v6 majority | Wrong audience |

## Consequences
### Positive
- Full control of SQL; TS-first; single dialect = much smaller code.
### Negative
- Must re-implement large API surface; compatibility only as good as test coverage.
### Risks
- Hidden v6 behaviours → differential tests (ADR-004).

## Dependencies
Constrains ADR-002..005.
