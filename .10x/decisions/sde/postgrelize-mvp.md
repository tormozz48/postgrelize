# SDE — postgrelize-mvp

## M0 — Tooling (T01–T04) — done 2026-11-14
Built:
- `package.json` `@tormozz48/postgrelize`, ESM+CJS exports, `pg` peer, scripts (build, lint, format, typecheck, test*, docs, db:up/down).
- TypeScript 6.0.3 strict (`tsconfig.json` for typecheck incl. tests; `tsconfig.build.json` for d.ts).
- oxlint 1.93 (`.oxlintrc.json`: correctness+suspicious errors, no-explicit-any, explicit-module-boundary-types on src, import/no-cycle, no default exports), oxfmt 0.78.0 exact (`.oxfmtrc.json`).
- vite 8 library build (`vite.config.ts`, rolldown, externals = peer deps + node builtins) + vite-plugin-dts.
- vitest 5 projects: unit, build (dist smoke test), integration, compat; DB global setup with reachability check; `withSchema` helper (random schema per test).
- `docker-compose.yml` PG (default 16).
- TypeDoc (`typedoc.json`, fails on undocumented exports) → `docs-site/`.
- Workflows: ci.yml, release.yml, docs.yml.

Deviations from plan:
- Added publish to GitHub Packages (ADR-006) and TypeDoc/Pages (ADR-007) per user requests.
- `npm test` excludes `build` project (needs dist); run `test:build` after build.
- `runBoth` compat helper deferred to T15 (YAGNI until first compat scenario).

Tech debt:
- CJS consumers get `index.d.ts` (ESM-flavoured types) for `require`; evaluate `index.d.cts` with `@arethetypeswrong/cli` once real exports exist (T10).
- CI workflows not yet executed on GitHub (branch not pushed).

## M1 — Core (T05–T15) — done 2026-11-14
Built (`src/`):
- `sql/` immutable AST + compiler (`compile`, `finalize` chunk → `$n` numbering, single pass, no inlined values).
- `expressions/` `Op` (`Symbol.for(name)` — interchangeable with v6), `literal/fn/col/cast/json/where/excluded`.
- `where/` v6 where compiler: all v6 ops, nested JSON paths with v6 casts, `$nested$`, `::cast`, Op.any/all/values, PG ops (isDistinctFrom, hasKey/hasAnyKeys/hasAllKeys), IN → `= ANY($n)` above threshold (default 100, `inAsAnyThreshold`).
- `data-types/` v6 DataTypes (callable/bare), JSON(B) serialize, RANGE parse/serialize (v6 bound objects), ARRAY element serialize.
- `errors/` v6 error classes (names `Sequelize*`), SQLSTATE + connection code mapping.
- `connection/` option parsing (URI / args / options), pg pool (`types` override: DATE as string), executor with logging (`Executing (<tx>|default): sql`), timezone via `-c TimeZone`.
- `query/raw-query.ts` replacements/bind → bound params with SQL tokenizer (strings, identifiers, comments, dollar quotes, casts, `?|`/`?&`).
- `transaction/` Transaction (savepoints, isolation, readOnly, afterCommit), managed runner, AsyncLocalStorage CLS (`Sequelize.useCLS()`).
- `model/` definition normalization (v6 defaults: auto `id`, timestamps, `inflection` pluralize/underscore), query builders, row parser, `Model` class shell, v6-compatible public types.
- `sequelize.ts` Sequelize class; `index.ts` public exports (all TSDoc'd, TypeDoc strict).

Tests: unit 64, integration 22 (incl. extensions, CLS, savepoints, NOWAIT/SKIP LOCKED, connection errors), compat 16 differential scenarios vs sequelize@6.37.8, `tests/types/model-types.ts` compile-time checks. Coverage ~92% lines overall, model.ts ~80%.

Deviations:
- Added runtime dependency `inflection@~1.13.4` (same as v6) for table-name parity.
- `Model<TAttributes extends object>`; `AnyModel = Model<any, any>` (lint-disabled, v6 compat), InferAttributes uses key remapping (as v6) — excluding Model base keys first avoids infinite instantiation.
- TypeDoc `validation.notExported` disabled (internal helper types); `notDocumented` still enforced. Inline object types replaced by named, documented types.
- Hooks, validations (incl. `allowNull` ValidationError), scopes, paranoid deferred to M3 as planned; NOT NULL violations currently surface as `DatabaseError` (v6 raises `ValidationError` before the query).
- `UUIDV1` not implemented (no dependency on `uuid`); `Deferrable` deferred to M5.

Tech debt:
- CJS consumers get ESM-flavoured `index.d.ts` (check with @arethetypeswrong in M2).
- `count({ group })` returns array typed as `number` (v6 overload shape) — add overload.
- `Model` static getters (`tableName`, `rawAttributes`) are getters, v6 has plain properties (assignment not supported).
- model.ts coverage 80% — more instance-path tests in M3.
