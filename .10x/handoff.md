# Handoff

**From:** Cycle 1 (M0–M2) complete → **To:** next cycle brainstorm (M3: hooks, scopes, paranoid, timestamps, validations, optimistic locking)

- What exists: `decisions/sde/postgrelize-mvp.md` (M0, M1, M2 sections), QA + security reports in `.10x/reviews/`.
- Open tech debt: CJS `.d.cts`, `count({ group })` typing, bulk-insert chunking, model.ts coverage, `UUIDV1`, `Deferrable`.
- Owner actions: enable GitHub Pages (Source: GitHub Actions); create first release tag when ready (`npm version 0.1.0` → push tags).
- Runbooks: `decisions/sre/postgrelize-mvp.md`, release procedure `decisions/devops/postgrelize-mvp.md`.
