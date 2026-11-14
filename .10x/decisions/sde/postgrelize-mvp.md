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
- `src/index.ts` empty stub with oxlint override `unicorn/no-empty-file` — remove override in T05.
- CJS consumers get `index.d.ts` (ESM-flavoured types) for `require`; evaluate `index.d.cts` with `@arethetypeswrong/cli` once real exports exist (T10).
- CI workflows not yet executed on GitHub (branch not pushed).
