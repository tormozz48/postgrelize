# ADR-032: Type-level parity with the Sequelize v6 declarations

**Status:** Accepted
**Date:** 2026-11-22
**Feature:** Sequelize v6 parity (TypeScript types)
**Author:** 10x-Team (Principal Architect)

## Context
The runtime is a drop-in for Sequelize v6, the declarations were not. A production app (ddt, ~815 files that import the ORM) failed `tsc` with 4,619 errors after only swapping `'sequelize'` for `'postgrelize'`. Four gaps explained all of them: (1) the `Model` family: `Model<TAttributes extends object = Values>` (an interface without an index signature is not a `Record<string, unknown>`), a `ModelStatic` whose constructor took typed values, `InitOptions` without `name`, finder options without `replacements`; (2) `Sequelize#query` without generics or overloads; (3) a non-generic `Association` and no exported `*Mixin` types; (4) missing root exports (`Includeable`, `ProjectionAlias`, `FindAndCountOptions`, `Options`, `Utils`).

## Decision
- Mirror the v6 declarations exactly where code written for v6 meets them: names, generics and defaults. `Model<TAttributes extends {} = any, TCreationAttributes extends {} = TAttributes>`: the `any` default and the `{}` constraint are what let interface-typed models and untyped `class X extends Model {}` compile. `ModelStatic<M>` is `NonConstructor<typeof Model> & { new (...): M }`.
- Port the v6 `Sequelize#query` overload set. The non-`SELECT` typed results are collapsed into one overload keyed by `TypedQueryResults`, with the same result types as v6. `QueryTypes` is also a type (`QueryTypes.SELECT` in type positions), as the v6 enum is.
- `Association<S, T>` and the four association classes are generic with v6 defaults. The association class names collide with the public decorators (`HasMany`, `BelongsTo`, `HasOne`, `BelongsToMany`, ADR-022), so the root exports them as generic **types** next to the decorator values (a type and a value may share a name); `instanceof HasMany` keeps being unavailable at the root (`Sequelize.HasMany` is the class).
- Every `*Mixin` and `*MixinOptions` type of the four v6 association files is exported.
- `Utils` is exported as a value plus type namespace with the v6 members that have a postgrelize counterpart (`Fn`, `Col`, `Cast`, `Literal`, `Json`, `Where`, `SequelizeMethod`, `useInflection`, `pluralize`, `singularize` and the helper types). The other v6 helpers are internal.
- Types never claim more than the runtime does where that would hide a defect: v6 option keys that postgrelize does not implement stay out of the option types and are listed, with a reason, in `tests/compat/type-parity/exceptions.json` (shrink-only). One key is typed although it is not applied, because v6 code uses it: `InitOptions.name` (documented in TSDoc). `FindOptions.replacements` is not typed: finders do not substitute placeholders.
- Proof is a test, not a review: `tests/compat/type-parity.test.ts` compiles a corpus of the TypeScript a v6 app writes against the v6 declarations **and** against postgrelize, and compares exported type names and the keys of the option types with the v6 declarations through the compiler API.

## Alternatives Considered
| Alternative | Pros | Cons | Why Not |
|---|---|---|---|
| Re-export the v6 `types/` | Exact | A dependency on `sequelize`, and v6 types describe the v6 runtime | Forbidden by ADR-001 / no new runtime dependency |
| Keep `Values` / `object` and document casts | No type change | 4,619 errors for the first migrating app | Defeats the drop-in promise |
| Rename the decorators | Exports the classes as values | Breaking change of ADR-022 | Types are enough for v6 code |

## Consequences
### Positive
- Code valid under the v6 types compiles under postgrelize; a test keeps it that way.
### Negative
- `Model` attributes default to `any` like v6, so an untyped model loses the `Record<string, unknown>` strictness. Typed models (the recommended way) are unaffected.
- `InitOptions.name` is typed but not applied; the allow-list records every other gap.
### Risks
- A new v6 declaration appears only when `sequelize` is upgraded; the test then lists the new names.

## Dependencies
ADR-001, ADR-016, ADR-022, ADR-030.
