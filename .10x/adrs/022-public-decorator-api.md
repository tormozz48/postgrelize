# ADR-022: Public decorator API for models

**Status:** Accepted · **Date:** 2026-11-15 · **Refines:** ADR-021 (decision 7 of the S6 design)

## Context

ADR-021 and the S6 design call for an optional public decorator API (`@Table`, `@Column`, associations, hooks, `sequelize.addModels`) with names from `sequelize-typescript`. Open design questions: how a field decorator finds its class, supporting both decorator proposals, how types are given, and how the result stays identical to `Model.init`.

## Decision

- Decorators only **record metadata**; `sequelize.addModels(classes)` calls `Model.init` and the association methods. Nothing else creates models, so decorated and hand-written models cannot diverge.
- Metadata lives in a `WeakMap` (`MetadataStore`), keyed by the class (legacy) or by the TC39 `context.metadata` bag, merged along the class chain at `addModels`. No `reflect-metadata`, no property on the class.
- `DecoratorSignature` is the only place that tells TC39 `(value, context)` from legacy `(target, key, descriptor?)`. Every public decorator is built by `DecoratorFactory` and works in both modes.
- TC39 field decorators get no class, only `context.metadata`, which needs `Symbol.metadata`. Importing the library defines `Symbol.metadata` (`Symbol.for('Symbol.metadata')`) when absent.
- A class field would shadow the accessors that `Model.init` defines on the prototype. Under TC39 the field decorator registers an initializer that removes the own property after the field is defined. Under legacy decorators users set `useDefineForClassFields: false` (as with `sequelize-typescript`).
- Column types are never inferred: `@Column(DataTypes.X)` or `@Column({ type })`; a missing type throws from `addModels`.
- Decorator factories are exported `const` functions, like `literal` and `fn` (thin factories); the `ForeignKey` decorator shares its name with the v6 type `ForeignKey<T>` through a type and a const of the same name.
- Tests: `tests/compat/decorators.test.ts` compares decorated models with `init` on postgrelize and Sequelize v6; the fixture in `tests/support/decorated-fixture.ts` runs under TC39 (`unit`) and under legacy lowering (`decorators-legacy` project: `npx vitest run --project decorators-legacy`).

- `@Index` is marked `@hidden` in TSDoc: VitePress matches `index.md` case-insensitively, so TypeDoc's `variables/Index.md` breaks the docs build. It is documented in the Decorators guide.

## Rejected alternatives

- **`reflect-metadata` and design-type inference:** a new dependency and a legacy-only emit option; explicit types are simpler and work in both modes.
- **Initializing a model from the first decorator call:** the owning `Sequelize` instance is unknown at class definition time, and associations need all classes; hence the deferred `addModels`.
- **Standard decorators only:** would exclude NestJS and `sequelize-typescript` users, the people this API is for.

## Consequences

- No SQL input is added: decorators feed `Model.init` and association options already covered by ADR-020.
- Decorator-using projects need a toolchain that lowers decorators; the published package does not.
- `src/index.ts` exports names such as `Column`, `Table`, `Index`, `Comment`, `Default` and `Unique`; these are decorator functions only.
