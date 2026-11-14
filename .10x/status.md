# Status

**Project:** postgrelize — PostgreSQL-only, Sequelize v6 drop-in ORM (TypeScript)
**Feature slug:** `postgrelize-mvp`
**Current phase:** Phase 4 — Implementation in progress (M0 done; next T05)

## Phases
- [x] Phase 0: Brainstorming — spec `.10x/specs/2026-11-14-postgrelize-mvp-design.md`, gap analysis `.10x/specs/2026-11-14-pg-sql-gap-analysis.md`
- [x] Phase 1: Strategy (CTO + PM)
- [x] Phase 2: Design (Architect + Staff Engineer + ADRs 001–005)
- [x] Phase 3: Planning (EM + Senior Engineer)
- [ ] Phase 4: Implementation — this cycle: M0–M2 (M0 done)
- [ ] Phase 5: Verification (QA + Security)
- [ ] Phase 6: Delivery (DevOps + SRE)

## Blockers
- none

## Tasks (cycle 1: M0–M2) — details in decisions/engineering-manager/postgrelize-mvp.md
- [x] T01 package/tsconfig/oxlint/oxfmt
- [x] T02 vite lib build
- [x] T03 vitest projects + docker PG + helpers
- [x] T04 CI + release (GitHub Packages) + docs (TypeDoc → Pages)
- [ ] T05 sql ast + compiler
- [ ] T06 expressions + Op
- [ ] T07 where compiler
- [ ] T08 data-types
- [ ] T09 errors
- [ ] T10 connection + Sequelize shell
- [ ] T11 transactions
- [ ] T12 model definition + instance basics
- [ ] T13 finders
- [ ] T14 writes
- [ ] T15 differential suite M1
- [ ] T16 v6 conflict options
- [ ] T17 onConflict normalize/compile
- [ ] T18 onConflict wiring + Model.insert + wasInserted
- [ ] T19 onConflict integration suite
