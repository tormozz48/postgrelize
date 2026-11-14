# ADR-003: `onConflict` option and `Model.insert()` for advanced upsert

**Status:** Accepted
**Date:** 2026-11-14
**Feature:** postgrelize-mvp
**Author:** 10x-Team (Architect + Staff Engineer)

## Context
v6 supports only `ON CONFLICT (cols) [WHERE pred] DO UPDATE SET c = EXCLUDED.c` / `DO NOTHING`. Needed: ON CONSTRAINT, expression targets, arbitrary SET expressions, DO UPDATE WHERE, inserted/updated flag.

## Decision
One declarative option `onConflict: { target, action }` (spec §5.1) on `create`, `bulkCreate`, `upsert`, and new `Model.insert()`. `excluded(col)` expression builder. Per-row flag via `RETURNING (xmax = 0)`, exposed as `instance.wasInserted`. Mixing with v6 conflict options throws.

## Alternatives Considered
| Alternative | Pros | Cons | Why Not |
|---|---|---|---|
| Extend v6 options (`updateOnDuplicate` accepting objects) | Fewer concepts | Overloads v6 semantics, ambiguous | Violates additive rule |
| Fluent query builder `Model.insertInto().onConflict()...` | Very expressive | Second API style, larger surface | YAGNI for MVP |
| Expose MERGE instead | Standard SQL | PG15+, different semantics (no unique-index arbitration, race-prone) | Different use case; P1 |

## Consequences
### Positive
- One plain-data option covers all INSERT ON CONFLICT grammar used in practice; easy to validate and compile.
### Negative
- Users learn one new option shape.
### Risks
- `xmax` trick relies on PG internals → widely used, tested on PG16–18.

## Dependencies
ADR-002 (bound params), ADR-005 (option normalized by pure functions).
