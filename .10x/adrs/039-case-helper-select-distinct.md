# ADR-039: `caseWhen()` helper and `selectDistinct` option

Status: Accepted (2026-11-28)

## Context

Applications moving from raw SQL need `CASE` expressions and `SELECT DISTINCT` over joined sources. Sequelize v6 has neither as an API.

## Decision

- `caseWhen().when(whereOptions, value).else(value)` builds a searched `CASE`. Conditions use the `where` compiler; values are bound, with a fixed cast for numbers, bigints, booleans and dates, because an untyped parameter in `THEN` resolves to `text`.
- `selectDistinct: true` is the find option for `SELECT DISTINCT`.

## Rejected alternatives

- `case()`: `case` is a reserved word, so it cannot be a named import without renaming.
- A `distinct: true` find option: v6 code passes `distinct: true` to `findAndCountAll`, which forwards the options to `findAll`; the rows query would change (breaks the v6 contract).
- Inline numeric `CASE` results as literals: breaks "values are always bound" (ADR-002).

## Consequences

- `order` / `group` of a `selectDistinct` or grouped query must refer to an expression with bound values by its alias, because each occurrence gets its own parameters.
- `count` and `findAndCountAll` do not apply `selectDistinct`.
