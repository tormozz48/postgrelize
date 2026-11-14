# Staff Engineer — Coding standards (postgrelize)

## Style (ADR-005, user requirement 2026-11-14)
- Functional style: pure functions, `readonly` types, no input mutation, expressions over statements, `map/filter/reduce` over loops where it reads clearly.
- Classes only for v6-required public API (`Sequelize`, `Model`, `Transaction`, error classes). Methods delegate to core functions; no business logic in class bodies.
- No `this` in core modules. No module-level mutable state (except AsyncLocalStorage instance and pool owned by Sequelize instance).
- SOLID: one module = one responsibility; dependency inversion via function parameters (`Executor`), never import `pg` outside `src/connection`.
- YAGNI: no code without a test that needs it; no speculative options/abstractions/plugin points.
- Small units: functions ≤ ~40 lines, files ≤ ~300 lines; split by responsibility, not by size alone.
- Discriminated unions + exhaustive `switch` with `never` check for AST.
- Errors: throw v6 error classes at boundaries; core returns values or throws `Error` for programmer errors only.
- No comments explaining obvious code; TSDoc on public API only.
- Naming: `camelCase` functions, `PascalCase` types; files `kebab-case.ts`.
- Imports: relative within `src`, no barrel re-exports except `src/index.ts`.

## Tooling standards
- `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `verbatimModuleSyntax`.
- oxlint with correctness + suspicious + pedantic-select rules; no `any` in core (use `unknown`); `any` allowed only in v6 type-compat declarations.
- oxfmt defaults.
- Tests mirror `src` paths: `tests/unit/<module>/*.test.ts`.

## Cross-cutting
- Logging: v6 `logging` option (function | false), called with SQL text + `{ bind }` — in shell only.
- Security: values always bound (ADR-002); identifiers always quoted via one `quoteIdent` function.
