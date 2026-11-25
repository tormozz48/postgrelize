# Status

**Project:** postgrelize — PostgreSQL-only, Sequelize v6 drop-in ORM (TypeScript)
**Feature slug:** `postgrelize-mvp`
**Current phase:** Backlog 3 delivered including S10 performance; next: backlog 4 PostgreSQL gap stages S14 → S12 → S11 → S13 → S16 → S17 → S15 (spec `.10x/specs/2026-11-15-backlog-4-roadmap-design.md`); 1.0.0 released (2026-11-21); 1.1.0 released (2026-11-22, S19 v6 parity); 1.2.0 released (2026-11-22, retry, connectionManager, v6 type API); 1.3.0 released (2026-11-22, findByPk/replacements, default export + CJS, v6 gates G1–G4, docs reference); 1.4.0 released (2026-11-23, G5 parts 3–9: hooks, cascade hooks, sequelize.query, where guards); 1.5.0 released (2026-11-23, G5 parts 9–14, type parity IV, default values, inlined raw replacements); 1.6.0 released (2026-11-23, v6 parity for the ddt migration R1–R9, T2–T11, ADR-037); 1.7.0 released (2026-11-24, v6 parity Q–X from ddt, ADR-038); 1.8.0 released (2026-11-24, v6 parity Y–AI, PR #165); 1.8.1 released (2026-11-24, instance reload and ddt type gaps, PR #168); 1.8.2 released (2026-11-24, generated type-call tests, `changed(key, value)` overload, PR #170); 1.8.3 released (2026-11-24, reload() include, generic where helpers, PR #172); 1.8.4 released (2026-11-24, nested reload() includes, v6-style logged SQL, PR #176); 1.8.5 released (2026-11-25, query alias follows the live Model.name, PR #178); 1.9.0 released (2026-11-25, DataTypes.<X>DataType interface family, PR #180)

**S19 (v6 parity from a production migration):** done, in release 1.1.0 (PRs #99–#107): `afterConnect`, `useCLS(namespace)`, `minifyAliases`, static aliases, hook shorthands, `Model` and `QueryInterface` methods, `Sequelize#truncate`, `Deferrable.SET_*`; `tests/unit/api-surface.test.ts` keeps the allow-list (142 names, each with a reason) from growing.

**Docs reference rework:** done, merged to `main` 2026-11-22 (PR #127, merge commit `3e40a1b`), released in 1.3.0. Reference hub, generated Extensions page and option reference, errors and connection guide pages, `@postgrelize` TSDoc tag, `<Ext />` badge; spec `.10x/specs/2026-11-22-docs-reference-design.md`, ADR-035; record `.10x/decisions/staff-engineer/docs-reference.md`.

**S11 (DDL objects):** in progress — PR1 extensions and sequences (#70), PR2 functions and triggers (#72), PR3 views (#73), PR4 row-level security (#74), PR5 UNLOGGED/TEMP tables (#75) done (all six matrix rows `supported`); spec `.10x/specs/2026-11-16-s11-ddl-objects-design.md`, ADR-025.

**S17 (Operator helpers):** done — `Op.similarTo` / `notSimilarTo`, `jsonPathExists`, `containedOrEqual` / `containsOrEqual`, `pg_trgm` `Op`s; helpers `jsonbPath`, `toTsVector` / `*ToTsQuery`, `tsRank`, `tsHeadline`, `setWeight`, `trigramSimilarity` / `trigramWordSimilarity` / `trigramDistance`; 5 `literal` rows promoted; spec `.10x/specs/2026-11-16-s17-operator-helpers-design.md`.

**S12 (Set operations and FROM sources):** done — set operations (`Subquery#union/intersect/except`), `source: Subquery`, `withTies`, `from` sources (`values`, `function` + ordinality, `jsonTable` PG17, `lateral`, `{ model, sample }`), `sample` (TABLESAMPLE), lateral top-N includes, data-modifying CTEs (`Model.insert/update/deleteStatement`), CTE `search` / `cycle`; 8 matrix rows flipped; spec `.10x/specs/2026-11-15-s12-set-ops-from-design.md`, ADR-024. Not modelled: `NESTED PATH` in JSON_TABLE, `INSERT … SELECT FROM cte` as main statement.

**S14 (Types I):** done — HSTORE objects fixed; `LTREE`, `TIMESTAMP`, `MONEY`, `MACADDR8`, `XML`, `BIT` / `VARBIT`, `TSQUERY` added; spec `.10x/specs/2026-11-15-s14-types-i-design.md`.
**S15 (Types II):** done (pending PR 4 merge) — spec `.10x/specs/2026-11-16-s15-types-ii-design.md`, ADR-026. PR 1 geometric types (`POINT` … `CIRCLE`) merged (#77); PR 2 `MULTIRANGE` (#79); PR 3 `COMPOSITE` (#80); PR 4 PostGIS GeoJSON (hex EWKB reader/writer, optional CI job).

**Feature examples (S16b):** in progress — every beyond-v6 feature needs a runnable example, a guide section and CI proof; audit `.10x/reviews/2026-11-16-feature-example-audit.md`, spec `.10x/specs/2026-11-16-feature-examples-design.md`. PR 1 (#85, merged): matrix fields (`beyondV6`, `example`, `guide`), `EXTRA_FEATURES`, `tests/docs/feature-examples.test.ts`. PR 2: examples for NULLS FIRST/LAST, OVERRIDING and long `IN` lists; `KNOWN_GAPS` empty. S13 rows included; PostGIS joins when S15 lands it.

**S9 (PostgreSQL coverage matrix):** done — 133 rows (69 supported, 13 literal, 39 planned, 12 out-of-scope); gap stages S11–S17 queued in backlog 4: `.10x/reviews/2026-11-15-pg-coverage-matrix.md`.

## Phases
- [x] Phase 0: Brainstorming — spec `.10x/specs/2026-11-14-postgrelize-mvp-design.md`, gap analysis `.10x/specs/2026-11-14-pg-sql-gap-analysis.md`
- [x] Phase 1: Strategy (CTO + PM)
- [x] Phase 2: Design (Architect + Staff Engineer + ADRs 001–005)
- [x] Phase 3: Planning (EM + Senior Engineer)
- [x] Phase 4: Implementation — this cycle: M0–M2 (M0, M1 done)
- [x] Phase 5: Verification (QA + Security)
- [x] Phase 6: Delivery (DevOps + SRE)

## Blockers
- none

## Tasks (cycle 1: M0–M2) — details in decisions/engineering-manager/postgrelize-mvp.md
- [x] T01 package/tsconfig/oxlint/oxfmt
- [x] T02 vite lib build
- [x] T03 vitest projects + docker PG + helpers
- [x] T04 CI + release (GitHub Packages) + docs (TypeDoc → Pages)
- [x] T05 sql ast + compiler
- [x] T06 expressions + Op
- [x] T07 where compiler
- [x] T08 data-types
- [x] T09 errors
- [x] T10 connection + Sequelize shell
- [x] T11 transactions
- [x] T12 model definition + instance basics
- [x] T13 finders
- [x] T14 writes
- [x] T15 differential suite M1
- [x] T16 v6 conflict options
- [x] T17 onConflict normalize/compile
- [x] T18 onConflict wiring + Model.insert + wasInserted
- [x] T19 onConflict integration suite

## Cycle 1 sign-off (2026-11-14)
- Tests: 123 + build smoke + type checks — green locally; CI on PR.
- QA: `.10x/reviews/2026-11-14-qa-report.md` — release-ready for 0.x.
- Security: `.10x/reviews/2026-11-14-security-review.md` — no open High/Medium.
- Ops: `decisions/devops/`, `decisions/sre/` (runbooks).

## Cycle 2 (M3) tasks — spec `.10x/specs/2026-11-14-m3-model-lifecycle-design.md`, ADR-008
- [x] T20 hooks
- [x] T21 validation (validator.js + Standard Schema)
- [x] T22 scopes
- [x] T23 paranoid
- [x] T24 optimistic locking
- [x] T25 tests + docs

## Cycle 2 (M3) verification (2026-11-14)
- unit 77, integration+compat 71 (compat 38 scenarios vs sequelize@6), types, build, docs — green locally.
- Security: no new SQL surfaces (hooks/validators run user code by design; scope options flow through existing where/order compilers and allowlists). Validation errors may include offending values (`value`) — same as v6.

## Cycle 3 (M4) tasks — spec `.10x/specs/2026-11-14-m4-associations-design.md`, ADR-009
- [x] T26 association definitions
- [x] T27 include normalization
- [x] T28 join SELECT builder
- [x] T29 row tree assembly
- [x] T30 subQuery / separate / count
- [x] T31 accessors
- [x] T32 tests

## Cycle 3 (M4) verification (2026-11-14)
- 159 tests green locally (compat 49 scenarios vs sequelize@6), types, build, docs.
- Security: include `where`/`order`/attributes go through existing where/order compilers (identifiers quoted, values bound); include aliases come from association definitions, quoted.

## Cycle 4 (M5) tasks — spec `.10x/specs/2026-11-14-m5-query-interface-design.md`, ADR-010
- [x] T33 DDL builders
- [x] T34 QueryInterface
- [x] T35 FK/indexes/Deferrable/NULLS NOT DISTINCT
- [x] T36 sync/drop
- [x] T37 tests

## MVP sign-off (2026-11-14)
- QA: `.10x/reviews/2026-11-14-mvp-qa-report.md`; Security: `.10x/reviews/2026-11-14-mvp-security-review.md`.
- Ops: CI/release/docs workflows unchanged (`decisions/devops`, `decisions/sre`).
- Open: owner to enable GitHub Pages; first release tag needs owner approval.
- P1 backlog (gap analysis): CTE/DISTINCT ON/LATERAL include, MERGE, UPDATE FROM / DELETE USING, COPY, LISTEN/NOTIFY, cursors, SET LOCAL/RLS, advisory locks, identity/generated columns, RETURNING old/new.

## Release 0.1.0 (2026-11-14)
- Tag `v0.1.0` → release.yml: CI matrix green, published `@tormozz48/postgrelize@0.1.0` to npm.pkg.github.com (dist-tag `latest`, 46 files).

## P1 cycles — spec `.10x/specs/2026-11-14-p1-postgres-power-design.md`
- [x] P1-A query power
- [x] P1-B write power
- [x] P1-C connection power
- [x] P1-D schema power

## P1 sign-off (2026-11-14)
- 193 tests green (unit 108, integration + differential 85); v6 differential suite unchanged and green.
- QA: `.10x/reviews/2026-11-14-p1-qa-report.md`; Security: `.10x/reviews/2026-11-14-p1-security-review.md`.

## Release 0.2.0 (2026-11-14)
- Tag `v0.2.0` → release.yml green, `@tormozz48/postgrelize@0.2.0` published (50 files, dist-tag `latest`). Contents: P1 PostgreSQL power features.

## Release 0.3.0 (2026-11-14)
- Tag `v0.3.0` → release.yml green, `@tormozz48/postgrelize@0.3.0` published (51 files, `latest`). Contents: CTE options, `Model.copyTo`.

## Backlog — read replicas + nested creation (2026-11-14)
- [x] Replica routing (ADR-014), nested creation via `include`.
- 204 tests green (compat + integration + unit); lint, types, build, docs green.

## Release 0.4.0 (2026-11-14)
- Tag `v0.4.0` → release.yml, `@tormozz48/postgrelize@0.4.0`. Contents: read replicas (`replication`, `useMaster`), nested creation via `include`.

## Backlog — RETURNING old values + include scopes (2026-11-14)
- [x] `returningOld` / `oldValues` (PG18), scopes of included models (v6 parity).
- 213 tests green locally on PG16; integration + compat green on PG18; lint, types, build, docs green.

## Release 0.5.0 (2026-11-14)
- Tag `v0.5.0` → release.yml green, `@tormozz48/postgrelize@0.5.0` published. Contents: `returningOld` / `oldValues` (PG18), scopes of included models.

## Backlog 2 (roadmap `.10x/specs/2026-11-14-backlog-2-roadmap-design.md`)
- [x] S1 README: badges, self-hosted coverage on Pages (92.8% lines at start)
- [x] S2 Sequelize PostgreSQL issues: 73 classified, S2a parity regressions, S2b inherited bugs, public page `docs/sequelize-issues.md`
- [x] S3 VitePress documentation site (12 guides, executed examples, API reference)
- [x] S4 steps 1–3: Effect connection/transaction layer + `postgrelize/effect`
- [x] S4 step 4: hooks and read pipeline (findAll / count) as Effect programs (next: write paths)

## Release 0.6.0 (2026-11-14)
- Tag `v0.6.0` → release.yml green, `@tormozz48/postgrelize@0.6.0` published. Contents: README + coverage, Sequelize issue review fixes (S2a parity, S2b inherited bugs), fixed-issues page.

## Release 0.7.0 (2026-11-15)
- Tag `v0.7.0` → release.yml green, `@tormozz48/postgrelize@0.7.0` published. Contents: Effect-based connection/transaction layer, `postgrelize/effect`, transaction-start leak fix, separate-include `limit` per parent, `findEach` separate includes, VitePress docs site.

## OOP rewrite (2026-11-15) — owner decision: stop S4, remove Effect, everything as classes, one PR, release 0.8.0
- [x] remove Effect and `postgrelize/effect`
- [x] connection, errors, transactions, hooks
- [x] SQL compiler, where, expressions
- [x] data types, validation, DDL, QueryInterface, sync
- [x] model internals, associations, includes

## Release 0.8.1 (2026-11-15)
- Tag `v0.8.1` → release.yml green, `@tormozz48/postgrelize@0.8.1` published. No library code changes: test isolation and lock-ordering fixes (PR 31; the `sessions` docs example now orders its advisory-lock calls deterministically), AGENTS.md + documentation sync rules, ADR-019 (PR 32).

## Release 0.8.0 (2026-11-15)
- Tag `v0.8.0` → release.yml green, `@tormozz48/postgrelize@0.8.0` published. Breaking: `postgrelize/effect` removed. Contents: object-oriented architecture (ADR-018), describeTable enum fix.

## Backlog 3 progress (2026-11-15)
- [x] S5 injection assurance, S6 refactor (a–g), S9 PostgreSQL matrix, S7 coverage (99.7% lines)
- [x] S7b parity and robustness (PRs 47, 48, 50): bugs 1–5 fixed, v6 differences matched or documented; no `it.fails` left
- [x] S8a LLM docs (PR 46), S8b TSDoc pass + enforcement (PR 49)
- [x] S10 performance: bench + spec (51), rows/instances (52), includes (53), call overhead + SQL assembly (55), toJSON/change tracking/validation (56), guide page + re-baselined `bench/baseline.json` (this PR). Open: named prepared statements (spec #10, needs ADR) and SQL template cache (#11, deferred)

## Release 0.9.0 (2026-11-15)
- Tag `v0.9.0` → release.yml green (Node 20/22, PostgreSQL 16/17/18), `@tormozz48/postgrelize@0.9.0` published. Contents: SQL-injection hardening and audit (S5), refactor to small units with mixins and decorators plus public decorator API (S6), PostgreSQL matrix (S9), coverage 99.7% (S7), parity and robustness fixes (S7b), LLM docs and full TSDoc (S8), performance (S10). Next: backlog 4.


## Backlog 4 / S16 session and write extras (2026-11-15)
- [x] PR 1 (#61): named prepared statements, `statementCache` (ADR-023), bench case `findByPk statementCache`.
- [x] PR 2: `DEFERRABLE` transaction mode (`deferrable`), per-query `statementTimeout`, `bulkCreate({ unnest: true })`; spec `.10x/specs/2026-11-15-s16-session-extras-design.md`. All four matrix rows `supported`.
- Open: the `unnest` builder swaps a placeholder table for `unnest(...)` because the AST has no function in FROM; move it to the S12 `function` FromItem (ADR-024) once S12 lands. The stub bench gate for the default path was not rerun under load; run it before the next release.

## Release 0.10.0 (2026-11-16)
- Tag `v0.10.0` → release.yml green (Node 20/22, PostgreSQL 16/17/18), `@tormozz48/postgrelize@0.10.0` published. Contents: S12 set operations, LATERAL, FROM sources, data-modifying CTEs, CTE SEARCH/CYCLE; S14 types (HSTORE objects, ltree, MONEY, XML, BIT, TSQUERY, …); S16 opt-in `statementCache` (ADR-023), DEFERRABLE, statement timeout, UNNEST bulk insert; S10b faster raw reads; logo. `main` now requires a pull request: the release commit goes through a PR. Open: bench gate showed `bulkCreate 100` at +10.7% under load (S10b re-checked it).

## Release 0.11.0 (2026-11-16)
- Tag `v0.11.0` → release.yml, `@tormozz48/postgrelize@0.11.0`. Contents: S11 DDL objects (extensions, sequences, views and materialized views, functions and triggers, RLS policies, UNLOGGED/TEMPORARY tables; ADR-025) and S17 operator helpers (SIMILAR TO, jsonpath, full-text, network operators, `pg_trgm`). Next: S13 constraints/indexes/partitioning and S15 types II (running).


## Backlog 4 / S13 constraints and indexes (2026-11-16)
Spec `.10x/specs/2026-11-16-s13-constraints-indexes-design.md`, ADR-027.
- [x] PR 1: expression indexes (`{ expression }` index fields, `nulls`)
- [x] PR 2: EXCLUDE, NOT VALID, `validateConstraint`
- [x] PR 3: PG18 NOT ENFORCED, WITHOUT OVERLAPS, PERIOD
- [x] PR 4: declarative partitioning

## Release 0.12.0 (2026-11-16)
- Tag `v0.12.0` → release.yml, `@tormozz48/postgrelize@0.12.0`. Contents: S13 expression indexes, EXCLUDE, NOT VALID / `validateConstraint`, PG18 NOT ENFORCED / WITHOUT OVERLAPS / PERIOD, partitioning (ADR-027); S15 geometric, multirange, composite types and PostGIS GeoJSON (ADR-026, optional CI job); a runnable example, guide entry and CI check for every beyond-v6 feature. Backlog 4 (S11–S17) is complete.

## Backlog 5 proposed (2026-11-17)
- Distribution on npmjs.com (spec `.10x/specs/2026-11-17-backlog-5-roadmap-design.md`, ADR-028): S18a done in code (2026-11-21): package renamed `postgrelize`, `release.yml` publishes to npmjs with provenance via `NPM_TOKEN` plus a time-boxed deprecated mirror on GitHub Packages, PR job `package` (pack/publish dry run). Not released. Waiting for the owner: create `NPM_TOKEN` (`docs/maintainers-npm-setup.md`) and approve the first release (S18c). S18b (2026-11-21): npm version and downloads badges, migration note for scoped-name users. Next: S18c first release (owner approval), S18d.


## CHANGELOG.md (2026-11-21)
- `CHANGELOG.md` (Keep a Changelog 1.1.0) covers all 13 tags v0.1.0 … v0.12.0 plus `[Unreleased]`, with a stages-and-releases table; published on the site at `/changelog`, shipped in the npm package, checked by `tests/docs/changelog.test.ts`; `release.yml` creates the GitHub Release from the matching section. Rule in AGENTS.md: every user-visible PR adds a line under `[Unreleased]`; the release PR moves it to the new version.

## Release 1.0.0 (2026-11-21, released)
- First release on npmjs.com as `postgrelize` (ADR-028); `@tormozz48/postgrelize@1.0.0` mirror on GitHub Packages (deprecated). Contents: the rename (breaking for installers), npmjs publishing with provenance, `package` CI job, npm badges and migration note, CHANGELOG, hero art. Semver from 1.0.0: breaking → major. Release PR merged; tag `v1.0.0` awaits the owner's approval.
- Released: tag `v1.0.0` on merge commit `6551d10` (PR #95), `release.yml` run 44908491921. The first two npm publish attempts failed with `EOTP` (token without "Bypass two-factor authentication"); attempt 3 with a recreated token succeeded: `postgrelize@1.0.0` on npmjs.com (`latest`, provenance), mirror `@tormozz48/postgrelize@1.0.0`, GitHub Release v1.0.0. Verified: `npm view`, clean install plus ESM and CJS import (106 exports), docs site. npm showed a `0.0.0-stage` placeholder for a few minutes while processing.
- Open: configure the Trusted Publisher on npmjs.com (done by the maintainer), PR #96 switches `release.yml` to OIDC and drops the `NPM_TOKEN` check (merged); after the next release confirms it, delete the `NPM_TOKEN` secret and revoke the token; remove the mirror job after the second release that includes it.
- CI on Node 24 (2026-11-21): `ci.yml` check job runs Node 20/22/24 (docs build and `dist` artifact stay on 22); DB jobs run PostgreSQL 16/17/18 on Node 22 plus one extra job on Node 24 with PostgreSQL 18. Full suite (lint, format, typecheck, unit, integration, compat, docs, build, test:build, `npm run docs`) passed locally on Node 24.16 with no library changes. The ruleset for `main` has no required status checks, so no check names to update.
- Release process (docs release process PR): project skill `.claude/skills/release/SKILL.md` (approval gate, preflight, release PR, tag, verification, failure handling), `npm run release:preflight -- X.Y.Z [--before-bump] [--fast]` (`scripts/release-preflight.ts`, pure parts in `scripts/release-lib.ts` with `tests/unit/scripts/release-lib.test.ts`), AGENTS.md "Git, PRs and releases" rewritten, Release PR section in the PR template. No release was made.

## Release 1.1.0 (2026-11-22, released)
- S19: Sequelize v6 parity found by migrating a production project; additive only, so a minor bump. Release PR `chore/release-1.1.0`; released on the maintainer's go.
- Released: tag `v1.1.0` on merge commit `2d610c8` (PR #109), `release.yml` run 45005493053. Local preflight failed twice in `tests/integration/security/types.test.ts` under machine load (52–78); the maintainer approved releasing on green GitHub CI. First publish attempt failed `E403 OIDC permission denied` (npm Trusted Publisher config); after the maintainer fixed it, `gh run rerun --failed` published `postgrelize@1.1.0` (`latest`, provenance), mirror and GitHub Release v1.1.0 green. Verified: `npm view`, clean install, ESM and CJS import (153 exports). npm showed 1.0.0 for about a minute after the job went green (processing delay). Bench gate not run (maintainer declined).

## Release 1.7.0 (2026-11-24, released)

Tag `v1.7.0` on merge commit `aace2df` (PR #163), release.yml run 45373975836: ci gate, npm publish with provenance, GitHub Packages mirror and GitHub Release all green. `npm view postgrelize` shows `1.7.0` (`latest`, visible after a few minutes of registry lag); clean install imports in ESM (155 exports, `default` is the class) and CJS (constructable `Sequelize`, 156 keys), provenance attestation present. Contents: v6 parity found by ddt on 1.6.0 (PRs #161, #162): `fn()` string arguments and `Op.is` values as escaped literals (ADR-038), `col('a.b.c')` alias paths, mutable option types and `this` of attribute `get`/`set`, required includes nested inside an optional parent's `LEFT JOIN`, `Op.or`/`Op.and` object values, `changed()`/`previous()` inside after hooks, `fields`/`attributes` visible to `beforeBulkUpdate`. Bench gate run (stub, 3 runs): the branch and `main` give the same v6/pgz ratios on this machine, no regression. Not reproduced without the ddt errors: R3, T-U, T9, T1/T4, bankInstitution; `tableAs` is not in the v6 types.

## Release 1.6.0 (2026-11-23, released)

Tag `v1.6.0` on merge commit `79aaa92` (PR #159), release.yml run 45272430469: ci gate, npm publish with provenance, GitHub Packages mirror and GitHub Release all green. `npm view postgrelize` shows `1.6.0` (`latest`); clean install imports in ESM (155 exports, `default` is the class) and CJS (constructable `Sequelize`, 156 keys). Contents: v6 parity for the ddt migration (PR #158, R1–R9, T2–T11): finder `replacements` inlined as escaped literals (ADR-037, extends ADR-036), `queryGenerator.selectQuery`, `get`/`toJSON` with VIRTUAL getters, association instances in `order`, deep `$a.b.c$` paths, bigint finder values, `validate()` result, raw column types, further type parity. Bench gate not run (query code changed since 1.5.0).

## Release 1.5.0 (2026-11-23, released)

Tag `v1.5.0` on merge commit `1485527` (PR #156), release.yml run 45209782473: ci gate, npm publish with provenance, GitHub Packages mirror and GitHub Release all green. `npm view postgrelize` shows `1.5.0` (`latest`); clean install imports in ESM (155 exports, `default` is the class) and CJS (constructable `Sequelize`, 156 keys). Contents: G5 parts 9–14 (VIRTUAL attributes in `Model.update` and selected attributes, association naming collisions and `get` with several sources, timestamps set before validation, instance soft destroy/restore results, finished-transaction errors), type parity IV (`WhereOptions` on unions, `Order`, `count({ group })`, `update` returning tuple, mutable `IncludeOptions`, `dialectModule`, validator `this`, `max`/`min` generics), function `defaultValue`, explicit `undefined` vs defaults, and `sequelize.query` `replacements` inlined as escaped literals (ADR-036, narrow exception to ADR-002). Bench gate not run (query code changed since 1.4.0).

## Release 1.4.0 (2026-11-23, released)

Tag `v1.4.0` on merge commit `bbf066a` (PR #142), release.yml run 45153859514: ci gate, npm publish with provenance, GitHub Packages mirror and GitHub Release all green. `npm view postgrelize` shows `1.4.0` (`latest`, visible after a short registry delay); clean install imports in ESM (155 exports, `default` is the class) and CJS (constructable `Sequelize`). Contents: G5 parts 3–9 (hook semantics, cascade hooks, `sequelize.query` statements and messages, CLS in hooks, v6 guards for `update`/`destroy` without `where`, undefined `where` values, ENUM without values; breaking only for code relying on the old behaviour), `InitOptions.name`, `findAndCountAll({ group })`, type parity III. Not included: #140 (VIRTUAL attributes). Bench gate not run (query code changed since 1.3.0).

## Release 1.3.0 (2026-11-22, released)

Tag `v1.3.0` on merge commit `afab89f` (PR #129), release.yml run 45052095979: ci gate, npm publish with provenance, GitHub Packages mirror and GitHub Release all green. `npm view postgrelize` shows `1.3.0` (`latest`); clean install imports in ESM (155 exports, `default` is the class) and CJS (constructable `Sequelize`, `.Sequelize` property). Contents: type parity part 2 and finder `replacements` (#119), v6 compatibility gates G1–G4 (#120–#126), ADR-034 default export and CommonJS entry (#124, #125), docs reference rework (#127, ADR-035). Bench gate not run (query code changed since 1.2.0).

## Release 1.2.0 (2026-11-22, released)
- Second v6-parity release for the ddt migration: `retry` option (PR #113, re-landed after #112 went to a feature branch), public `sequelize.connectionManager` with `getConnection` / `releaseConnection` (#111), `pool` counters and `destroyConnection` (#116, ADR-033), Sequelize v6 type API (#114); faster release preflight (#115). Additive plus a type-level default change (`Model` attributes default to `any`), so a minor bump. Release PR `chore/release-1.2.0`; released on the maintainer's go. Bench gate not run.
- Released: tag `v1.2.0` on merge commit `9e28a02` (PR #117), `release.yml` run 45022786038, all jobs green. First release with the faster preflight (#115): lint, typecheck, docs and the test suites were taken from the CI run on the commit and reported as SKIP, so the whole gate took minutes. Verified: `npm view` (`latest` 1.2.0; the registry showed 1.1.0 for about two minutes after the job went green), clean install, ESM and CJS import (154 exports), `connectionManager.getConnection` present, GitHub Release v1.2.0, mirror published.
