# Handoff

**From:** SDE (M1 done) → **To:** SDE (M2: T16–T19)

- M1 core implemented and green locally: lint, format, typecheck (incl. tests/types), unit/integration/compat (102 tests), build, docs.
- Details, deviations, tech debt: `decisions/sde/postgrelize-mvp.md` (M1 section).
- M2 entry points: `src/model/query-builders.ts` (`buildInsert` → add `onConflict`), `src/sql/ast.ts` (`OnConflictNode` already supported by compiler), `src/expressions/methods.ts` (`excluded()` exists), `Model.bulkCreate/create/upsert`.
- Differential helper: `tests/support/compat.ts` (`expectSameResult` / `expectSameError`).
