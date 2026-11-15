# S6 — Refactor: small units, decorators, mixins

**Date:** 2026-11-15 · **Status:** approved direction (backlog 3 roadmap) · **ADR:** 021

## Owner requirements

- Smaller classes and functions: functions ≤ 20 lines, class files ≤ 150 lines.
- Use TypeScript's advanced features: decorators and mixins.
- Decorators are used internally and as an optional public decorator API for models.

## Baseline (main @ dc13a6a)

- 96 files in `src`, 18.3k lines.
- Counting code lines only (comments and blank lines excluded), 30 files exceed 150 lines; the largest is `model/model.ts` with 813 code lines.
- 110 functions exceed 20 code lines.

## Toolchain findings

- Vite 8 / Vitest 5 transform TypeScript with oxc. oxc lowers only legacy (`experimentalDecorators`) decorators, and standard TC39 decorators fail with `SyntaxError`. Node 24 cannot run decorators either, and `--experimental-strip-types` rejects them.
- `typescript.transpileModule` (already a dev dependency) lowers TC39 decorators to ES2022. A small Vite plugin applies it only to files that contain decorators. Verified in Vitest.

## Decisions

1. **TC39 standard decorators** (no `experimentalDecorators`, no `reflect-metadata`).
   - `build/decorators-plugin.ts` adds the TypeScript-transpile step to `vite.config.ts` (library build) and `vitest.config.ts` (all test projects).
   - The published `dist` contains no decorators, so consumers need nothing.
2. **The public decorator API works in both modes.** Each public decorator accepts the TC39 signature `(value, context)` and the legacy signature `(target, key, descriptor?)`, so it works in projects with or without `experimentalDecorators` (NestJS and sequelize-typescript users run the legacy mode).
3. **The benchmark runs through Vitest:** a `bench` project, `npm run bench -- --json out.json`, replaces `node --experimental-strip-types bench/orm.bench.ts`. `bench/compare.ts` stays a plain Node script, since it has no decorators.
4. **Size limits use a ratchet.** In `.oxlintrc.json`:
   - `max-lines` is 150 and `max-lines-per-function` is 20 for `src/**`, counting code lines only (`skipComments`, `skipBlankLines`), so TSDoc never pushes a file over the limit;
   - files that currently violate the limits are listed in an `overrides` block with the rules off;
   - every S6 PR removes its files from that list, and S6 is done when the list is empty;
   - new files can never be added to the list.
5. **Mixins:**
   - Large classes with many unrelated capabilities are split into capability mixins (`<TBase extends Constructor>(Base: TBase) => class extends Base { … }`).
   - `Model` is assembled from static capability mixins: finders, aggregates, writers, bulk/PostgreSQL writes, scopes, hooks, associations, schema (sync/drop). Instance capabilities are save/reload/destroy, values, and associations.
   - The public generic signature `class Model<TAttributes, TCreationAttributes>` and v6 typing stay unchanged; `tests/types` and the differential suite guard them.
   - Generated `.d.ts` and TypeDoc output must stay readable: each mixin is a named, exported (`@internal` where not public) class factory, and the members' TSDoc stays on the members.
6. **Internal decorators only where they remove real duplication** (YAGNI). These are the candidates; each is adopted only if it replaces existing repeated code:
   - `@hooked('beforeX', 'afterX')`: runs the hook pipeline around an operation;
   - `@inTransaction`: CLS / explicit transaction resolution and auto-commit scope;
   - `@logged`: query logging and benchmarking;
   - `@memoized`: lazy per-instance computed values such as resolved definitions.
7. **Public decorator API** (last S6 PR):
   - optional decorators: `@Table`, `@Column` (plus `@PrimaryKey`, `@AutoIncrement`, `@AllowNull`, `@Default`, `@Unique`, `@Index`, `@Comment`), `@CreatedAt` / `@UpdatedAt` / `@DeletedAt`, `@HasOne` / `@HasMany` / `@BelongsTo` / `@BelongsToMany` / `@ForeignKey`, hook decorators (`@BeforeCreate`, …), `@DefaultScope` / `@Scopes`;
   - registration through `sequelize.addModels([User, Post])`;
   - the result is identical to `Model.init` + associations, which differential tests verify against the equivalent `init` code;
   - names follow sequelize-typescript, to give its users a familiar migration path.

## Delivery (one PR each, merge after green CI)

1. **S6a, tooling:** decorators plugin, bench via Vitest (and AGENTS.md/docs commands), size-rule ratchet with the current violators list, ADR-021.
2. **S6b, `model/`:** `Model` assembled from mixins; `instance-lifecycle`, operations and query builders split; internal decorators where they apply.
3. **S6c, SQL layer:** `where`, `sql/compile`, `sql/ast`, `expressions`.
4. **S6d, DDL and schema:** `ddl-generator`, `query-interface`, `schema-synchronizer`.
5. **S6e, associations and includes.**
6. **S6f, the rest:** `sequelize.ts`, `transaction`, `errors`, `connection`, `validation`, `index.ts` (split into grouped re-export files if needed).
7. **S6g, public decorator API:** guide page, examples and differential tests.

**Gates for every PR:**
- behaviour: unit, integration, compat and docs suites unchanged and green;
- types: `tests/types` passes;
- performance: `bench/compare.ts` within +10% of the baseline;
- docs: `npm run docs` passes;
- the ratchet list never grows.

## Risks

- **Mixins and the generic `Model`:** TypeScript mixins cannot forward class generics. The generic `Model<…>` is the final class that extends the mixin chain, and statics keep the existing `this: ModelStatic<M>` pattern. If `.d.ts` readability or v6 typing degrades, fall back to delegating facades with capability classes (composition), which still meets the size limits.
- **Transform speed:** `transpileModule` runs only on files with decorators; measure test-suite time before and after.
- **Decorator overhead on hot paths:** the bench gate catches it, so hot-path methods are not wrapped.
