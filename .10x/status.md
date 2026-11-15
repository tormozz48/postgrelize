# Status

**Project:** postgrelize — PostgreSQL-only, Sequelize v6 drop-in ORM (TypeScript)
**Feature slug:** `postgrelize-mvp`
**Current phase:** Backlog 2 — brainstorm done (spec `.10x/specs/2026-11-14-backlog-2-roadmap-design.md`); S1–S4 (steps 1–3) done; open: intermittent suite timeouts, S4 later steps

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
- [x] S4 steps 1–3: Effect connection/transaction layer + `postgrelize/effect` (later steps: query pipeline, hooks)

## Release 0.6.0 (2026-11-14)
- Tag `v0.6.0` → release.yml green, `@tormozz48/postgrelize@0.6.0` published. Contents: README + coverage, Sequelize issue review fixes (S2a parity, S2b inherited bugs), fixed-issues page.

## Release 0.7.0 (2026-11-15)
- Tag `v0.7.0` → release.yml green, `@tormozz48/postgrelize@0.7.0` published. Contents: Effect-based connection/transaction layer, `postgrelize/effect`, transaction-start leak fix, separate-include `limit` per parent, `findEach` separate includes, VitePress docs site.
