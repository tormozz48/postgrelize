# Handoff

**From:** SDE (M0 done) → **To:** SDE (M1, start T05)

- M0 tooling built and green locally: lint, format:check, typecheck, test:unit, build, test:build, docs, test:db (PG16).
- New ADRs: 006 (CI/CD + GitHub Packages), 007 (typed public API + mandatory TSDoc + TypeDoc on Pages). Standards updated in `decisions/staff-engineer/postgrelize-mvp.md`.
- What was built + tech debt: `decisions/sde/postgrelize-mvp.md`. Remove `unicorn/no-empty-file` override for `src/index.ts` in T05.
- Not verified: workflows on GitHub (branch not pushed); Pages needs "Source: GitHub Actions" in repo settings.
