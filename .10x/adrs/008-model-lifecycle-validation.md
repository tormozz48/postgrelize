# ADR-008: Model lifecycle — hook pipeline, validator.js + Standard Schema validation

**Status:** Accepted
**Date:** 2026-11-14
**Feature:** postgrelize-mvp (M3)
**Author:** 10x-Team (Architect + Staff Engineer)

## Context
M3 adds hooks, validations, scopes, paranoid and optimistic locking with Sequelize v6 semantics. The user asked whether zod can be used for validation. v6 built-in validators (`isEmail`, `isUrl`, …) are validator.js functions; zod's rules and messages differ.

## Decision
1. **Validation:** runtime dependency `validator@^13` (same as v6) for built-in validators; validator names/args/messages follow v6. Extension: any **Standard Schema v1** object (`~standard.validate`) accepted as `validate.schema` (attribute) or `validationSchema` (model; `schema` is the v6 PostgreSQL-schema option); zod/valibot/arktype work without being dependencies. Issues map to `ValidationErrorItem`s.
2. **Hooks:** immutable hook registry per model (`ReadonlyMap<type, readonly Hook[]>`), replaced on add/remove; Sequelize-level hooks stored on the runtime and merged at run time. Runner = pure sequential reducer over async functions; hooks may mutate the options/instances they receive (v6 contract).
3. **Scopes:** scope definitions stored in model state; `Model.scope()` returns a subclass sharing state with the selected scope list (v6 shape); option merging is a pure function implementing v6 `_mergeFunction`.
4. **Paranoid / version:** implemented as pure option transforms (extra where / set items) applied in the query builders.

## Alternatives Considered
| Alternative | Pros | Cons | Why Not |
|---|---|---|---|
| zod only (emulate v6 validators) | One validation model, typed | Different acceptance rules/messages → breaks drop-in | Violates ADR-001 |
| zod as hard dependency for the extension | Simple typing of zod features | Locks users to zod | Standard Schema covers zod without coupling |
| Own implementations of validator.js functions | No dependency | ~40 validators, subtle edge cases | YAGNI / parity risk |

## Consequences
### Positive
- Byte-for-byte v6 validator behaviour; typed schema validation for any modern schema library.
### Negative
- New runtime dependency `validator` (~ same footprint as in v6).
### Risks
- Hooks mutating shared options → copy options at public entry points (as v6 `cloneDeep`), tests for mutation isolation.

## Dependencies
ADR-001, ADR-005.
