# ADR-027: Constraint, index-expression and partition options

**Status:** Accepted · **Date:** 2026-11-16 · **Feature:** S13 constraints and indexes · **Author:** Claude (Architect)

## Context
`addConstraint` and `addIndex` model only column lists. PostgreSQL adds EXCLUDE constraints, expression indexes, NOT VALID / VALIDATE, PG18 NOT ENFORCED / WITHOUT OVERLAPS / PERIOD, and declarative partitioning. Expressions, operators and partition bounds cannot be bound as parameters in DDL.

## Decision
- Extend existing option types additively; v6 shapes and defaults are untouched. New `type: 'exclude'` on `addConstraint`; `expression` as an alternative to `name` in an index field; `partitionBy` on `createTable`; new `QueryInterface` methods `validateConstraint`, `createPartition`, `attachPartition`, `detachPartition`.
- Identifiers are quoted; strategies, nulls ordering, index methods, operator classes and EXCLUDE operators pass allowlists/patterns. The operator pattern accepts only operator characters (`+-*/<>=~!@#%^&|?` and backtick) and rejects `--` and `/*`.
- Bound values (partition bounds) are `SqlLiteral` literals; `MINVALUE` / `MAXVALUE` are frozen marker constants (`PartitionBound`), so a string value can never be read as a keyword.
- **Expression strings are trusted SQL**, not escaped, documented as raw by design on the Security page (as in ADR-025). An expression index needs an explicit `name`: a name cannot be derived from SQL text.
- Version-specific forms (PG18) are sent as written; PostgreSQL rejects them on older servers with its own error.

## Alternatives Considered
| Alternative | Pros | Cons | Why Not |
|---|---|---|---|
| Parse and validate expression text | Safer | Needs a SQL parser; rejects valid SQL | Trust boundary documented instead |
| Accept bound strings `'MINVALUE'` | Terse | A real string value is indistinguishable | Marker constants |
| New top-level API (`addExclusion`) | Explicit | Breaks `addConstraint` symmetry with v6 | Extend `addConstraint` |

## Consequences
+ Migrations keep v6 call shapes; new features are opt-in.
− Callers must not build expressions from user input; no default names for expression indexes.
