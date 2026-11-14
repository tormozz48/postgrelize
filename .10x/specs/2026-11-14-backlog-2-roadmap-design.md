# Backlog 2 roadmap — README, Sequelize bug fixes, docs site, Effect core

**Date:** 2026-11-14 · **Status:** approved by owner · **Language of public docs:** English

Four independent sub-projects, delivered in this order. Each gets its own detailed spec, ADR(s),
branch and PR at its start; this document fixes scope, decisions and order.

## Decisions taken in brainstorming
| Topic | Decision |
|---|---|
| Order | README → Sequelize bugs → docs site → Effect rewrite |
| Coverage metrics | Self-hosted: CI coverage → shields.io endpoint JSON + HTML report on GitHub Pages; no external services |
| Inherited v6 bugs | Fixed by default; regression test each; differential test marks a documented divergence; public list of fixed Sequelize issues |
| Docs generator | VitePress on GitHub Pages; API reference from TSDoc inside the same site |
| FP library | **Effect** (replaces the originally proposed Rambda; Rambda not added) |
| Effect exposure | Internal core on Effect; public v6 API stays Promise-based; opt-in `postgrelize/effect` entry point |

## S1 — Repository front page (README)
- Badges: package version (GitHub Packages), CI status, coverage %, supported PostgreSQL (16–18) and Node (20+), license, docs link.
- CI: a `coverage` job (unit + integration + compat with `@vitest/coverage-v8`, reporters `json-summary` + `html` + `lcov`) on `main`; Pages deployment publishes `coverage/` and `coverage/badge.json` (shields endpoint format) next to the current docs.
- README structure: pitch, badges, install (GitHub Packages registry), 30-second example, "Why postgrelize" (PostgreSQL features table vs Sequelize), compatibility notes, links to docs/coverage, development, license.
- Done when: badges render on github.com, coverage badge reflects `main`, README reviewed for accuracy against the code.

## S2 — Sequelize issues and inherited bugs
- Research: open issues in `sequelize/sequelize` relevant to v6 + PostgreSQL (dialect label / postgres in title/body; v7-only issues out). Classify each: *fixed already in postgrelize*, *inherited bug*, *feature request*, *not applicable*. Store as `.10x/reviews/<date>-sequelize-issues.md` with links.
- For *fixed already*: add a regression test proving it.
- For *inherited bugs*: fix by default, regression test, differential test records the divergence explicitly (no silent mismatch).
- Public page "Sequelize issues fixed in postgrelize" (Markdown now, moved into the site in S3).
- Feature requests: triaged into a later backlog, not implemented here.
- Done when: every in-scope issue is classified, fixes merged with tests, page published.

## S3 — Documentation website (VitePress)
- Replaces the TypeDoc HTML site on Pages; TypeDoc kept as generator through `typedoc-plugin-markdown` → `/api/` section. `notDocumented` validation stays enforced.
- Guides with runnable examples: getting started, models & data types, querying (where/operators/scopes), associations & include, transactions, hooks & validation, migrations/QueryInterface/sync, PostgreSQL extensions (ON CONFLICT, MERGE, CTE, COPY, LISTEN/NOTIFY, advisory locks, replicas, RETURNING old), migrating from Sequelize, fixed issues, changelog.
- Example snippets live in `docs/examples/*.ts`, type-checked in CI (and executed against PostgreSQL where practical).
- Local search; coverage report linked under `/coverage/`.
- Done when: Pages serves the VitePress site with API reference, CI builds docs on PRs, no broken links.

## S4 — Functional core on Effect
- New ADR superseding ADR-005 (functional core + class shell) in the "how" and ADR-012 (no new runtime deps) for `effect`.
- Internal modules (connection manager, executor, transactions, COPY, notifications, query pipeline, hooks, validation) rewritten as Effect programs: typed error channel (mapped to v6 error classes at the boundary), `Scope`/`acquireRelease` for clients and transactions, `Layer`s for pool/runtime, pure functions elsewhere.
- Public Sequelize v6 API unchanged (Promises via `Effect.runPromise` at the shell); differential suite must stay green without changes.
- `postgrelize/effect` entry point: Effect-returning model/transaction methods, typed errors, exported as a separate build entry with its own docs page.
- Performance guard: benchmark of hot paths (findAll/insert/bulkCreate) before/after; regression budget agreed in the S4 spec.
- Done when: all suites green, bundle/perf within budget, Effect entry documented.

## Out of scope
- Sequelize v7 API, other dialects, npmjs.org publishing (stays on GitHub Packages).

## Risks
- S4 is a large rewrite: done incrementally module by module behind the unchanged public API; each step merged only with the full suite green.
- Fixing inherited bugs reduces drop-in parity: mitigated by explicit divergence list and docs.
