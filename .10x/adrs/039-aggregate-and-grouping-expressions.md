# ADR-039: Expressions for ordered aggregates, array slices and grouping sets

**Status:** Accepted (extends ADR-038)
**Date:** 2026-11-28
**Feature:** ddt migration

## Context
`array_agg` / `string_agg` / `jsonb_agg` with `ORDER BY` inside the call, array slices, `ROLLUP`, `CUBE` and `GROUPING SETS` had no form other than `literal()`, which cannot map attribute names to columns or take a list built at run time safely.

## Decision
- Factories `arrayAgg`, `stringAgg`, `jsonbAgg`, `arraySlice`, `rollup`, `cube`, `groupingSets`, `grouping` return three expression classes: `Aggregate`, `ArraySlice`, `GroupingClause`.
- Strings are attribute names, resolved like the items of `over()`.
- The `stringAgg` separator is written as an escaped literal (as ADR-038 does for `fn()` strings): the SQL equals the hand-written form, and the same expression repeated in two clauses stays identical. Slice bounds are validated safe integers written into the text.
- Value types are phantom type parameters read with `ExpressionResult<E>`. Finder return types do not change.

## Alternatives Considered
| Alternative | Why not |
|---|---|
| `fn(name, ...args, { orderBy })` | An options object is a valid v6 `fn()` argument; would change v6 semantics |
| Infer row types from `attributes` | Changes the finder generics that must match v6 (ADR-032) |
| Bind the separator | Differs from the hand-written SQL; two bound copies of one expression do not match in `GROUP BY` / `DISTINCT` |

## Consequences
- `FILTER (WHERE …)` and `WITHIN GROUP` stay `literal()`.
- Element types are declared by the caller, not checked against the database.
