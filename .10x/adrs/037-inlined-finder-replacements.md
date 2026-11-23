# ADR-037: Inline `replacements` of the finders as escaped literals

**Status:** Accepted (narrow exception to ADR-002; extends ADR-036)
**Date:** 2026-11-23
**Feature:** ddt migration, 1.6.0
**Author:** 10x-Team (Architect + Security Engineer)

## Context
ADR-036 inlined the `replacements` of `sequelize.query` and left the finders (`findAll`, `count`, `findByPk`, ... with `literal()` that holds `:name` / `?`) bound. That breaks queries that use one placeholder twice. v6 writes both occurrences as the same literal, so `SELECT to_char("createdAt" AT TIME ZONE :tz, ...) ... GROUP BY to_char("createdAt" AT TIME ZONE :tz, ...)` is valid. With bound values each occurrence became its own parameter (`$1`, `$2`), PostgreSQL cannot prove the two expressions equal, and fails with `column ... must appear in the GROUP BY clause`. A bound number is also typed by the column (`int4`), so `findByPk(99999999999)` raised `out of range for type integer` where v6 returns no row.

## Decision
- The finders write `replacements` into the SQL text through the same `SqlLiteral.escape` as `sequelize.query` (ADR-036). One code path in `RawQuery` serves both; the bound-parameter mode and its `::int4` / `::boolean` casts are removed.
- Values the finder itself builds (`where` values, `limit`, ...) stay bound `$n` parameters and are never scanned.
- A bound JavaScript integer outside the `int4` range (a `where` value compared with an `integer` column) is cast `::bigint`, so the comparison is false instead of an error, as in v6. Smaller numbers are unchanged.

## Alternatives Considered
| Alternative | Pros | Cons | Why Not |
|---|---|---|---|
| Keep binding, reuse one `$n` for equal values | Values stay bound | Needs equality of arbitrary values and matching of every token; `?` positional forms differ per use; does not fix the typing of numbers | Partial |
| Rewrite `GROUP BY` to the select alias | No inlining | Changes the SQL the user wrote | Not v6 behaviour |

## Consequences
### Positive
- Queries written for v6 with repeated placeholders run; the logged SQL shows the values, as in v6.
### Negative
- The injection surface of ADR-036 now also covers finder `replacements`; no plan cache for those statements.
### Risks
- An escaper bug would be an injection: covered by the payload and property tests of `tests/integration/security/finder-replacements.test.ts` on PostgreSQL 16/17/18.

## Dependencies
ADR-002, ADR-010, ADR-016, ADR-020, ADR-036.
