# Status

**Project:** postgrelize — PostgreSQL-only, Sequelize v6 drop-in ORM (TypeScript)
**Feature slug:** `postgrelize-mvp`
**Current phase:** Cycle 1 (M0–M2) — Delivery Complete; next cycle: M3 (hooks, scopes, paranoid, validations)

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
