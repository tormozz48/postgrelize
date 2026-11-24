# ADR-038: Inline string arguments of `fn()` and values of `Op.is` as escaped literals

**Status:** Accepted (narrow exception to ADR-002; extends ADR-036 and ADR-037)
**Date:** 2026-11-24
**Feature:** ddt migration, 1.7.0
**Author:** 10x-Team (Architect + Security Engineer)

## Context
Sequelize v6 `handleSequelizeMethod` writes every non-expression argument of `fn()` into the SQL text through `escape()`. `fn('COUNT', '*')` is `COUNT('*')`, `to_char(col, 'YYYY')` keeps its format string. postgrelize bound each argument as a parameter: `COUNT($1)` fails with `could not determine data type of parameter $1`, and a bound format string cannot be matched with the same expression in `GROUP BY`. `Op.is` in v6 renders any value (`IS NULL`, `IS true`, `IS <literal>`); postgrelize rejected everything but `null` and booleans.

## Decision
- The strings given to the public `fn()` factory are written into the SQL through the shared `SqlLiteral.escape` (ADR-010, ADR-036). `Fn` carries an internal `inlineStrings` flag that only `fn()` sets.
- Other arguments (numbers, dates, objects, expressions) keep their current handling: bound parameters, or the expression rendered as is.
- The postgrelize helpers that build `Fn` themselves (`trigramSimilarity`, the text search constructors, JSON path helpers) leave the flag off, so their strings stay bound parameters.
- `Op.is` renders `null` and booleans as `IS NULL|TRUE|FALSE`, an expression (`literal()`) as written, and any other value as an escaped literal (PostgreSQL rejects what is not a valid `IS` operand, as with v6).

## Alternatives Considered
| Alternative | Pros | Cons | Why Not |
|---|---|---|---|
| Keep binding, add a cast per argument | Values stay bound | Needs the type of every argument of every function; `COUNT('*')` has no value to cast; does not fix `GROUP BY` matching | Partial |
| Inline every `Fn` argument, helpers included | One rule | Widens the exception to postgrelize-only helpers, which v6 does not have | Not needed for parity |

## Consequences
### Positive
- `fn()` calls written for v6 run unchanged; the logged SQL shows the values, as in v6.
### Negative
- The injection surface of ADR-036 now also covers the strings of `fn()` and the value of `Op.is`; no plan cache for those statements.
### Risks
- An escaper bug would be an injection: covered by the payload and property tests of `tests/integration/security/inlined-literals.test.ts`.

## Dependencies
ADR-002, ADR-010, ADR-016, ADR-020, ADR-036, ADR-037.
