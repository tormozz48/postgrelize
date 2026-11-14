# ADR-015: RETURNING old values via `returningOld` + scope injection for includes

**Status:** Accepted
**Date:** 2026-11-14
**Feature:** postgrelize-mvp (backlog)
**Author:** 10x-Team (Architect + Staff Engineer)

## Context
PostgreSQL 18 lets `RETURNING` reference the pre-statement row (`OLD`). Sequelize v6 has no such API, so
this is an extension; it must not change v6 option semantics (`returning: boolean`). Separately, v6
injects the scope of included models into include options; postgrelize ignored it, which made results
differ from v6 for models with a `defaultScope`.

## Decision
1. Separate boolean option `returningOld` and an instance getter `oldValues` (same pattern as
   `wasInserted`, stored in a WeakMap, excluded from `InferAttributes`). SQL uses
   `RETURNING WITH (OLD AS "__pgz_old")` (new AST field `returningOld` alias on insert/update/merge
   nodes) and prefixed aliases parsed back into attribute values. Version gate via `runtime.serverVersion()`.
2. `normalizeIncludes` merges `activeScope(item.model ?? target)` into each include item using the existing
   `injectScope` (v6 `_defaultsOptions` rules) before computing `required`. Association lookup compares
   model state so scoped subclasses resolve.

## Alternatives Considered
| Alternative | Pros | Cons | Why Not |
|---|---|---|---|
| `returning: { old: true }` | one option | changes the type of a v6 option, breaks typings for v6 code | compatibility |
| `old.*` without `WITH (OLD AS ...)` | shorter SQL | clashes with relations aliased `old` (MERGE uses the model name as alias) | robustness |
| Fill `_previousDataValues` with old row | reuses `previous()` | `changed()` would report differences → v6 semantics change | surprising |
| Apply only `where` of include scopes | small | v6 merges every key (attributes, include) | incomplete compat |

## Consequences
### Positive
- Audit/diff of bulk updates and upserts in one round trip; include results match v6 for scoped models.
### Negative
- Include scope injection may change results for existing users relying on the previous (non-v6) behaviour.
### Risks
- Scope `include` merge relies on identity union (v6 `_uniqIncludes` merges same-model includes) — covered by differential tests for the common case; deep merge of duplicate includes left out (YAGNI).

## Dependencies
- ADR-009 (include strategy), ADR-002 (AST compile).
