# QA Report — MVP (M0–M5), 2026-11-14

## Results
- 171 tests green locally (PG16) — unit 89, integration + differential 82; CI matrix Node 20/22 × PG 16/17/18 green on every merged PR.
- Differential coverage vs sequelize@6.37.8: 53 scenarios — CRUD/where/aggregates/transactions/raw queries (16), upsert & bulk conflict options (8), lifecycle: hooks/validation/scopes/paranoid/version (14), associations/include/accessors (11), sync/alter/drop/QueryInterface (4). All equal.
- Type tests: v6 typing patterns (InferAttributes, CreationOptional, hooks, scopes, associations, include, onConflict) compile; misuse rejected.

## Bugs found and fixed across M3–M5
- Missing re-validation after `beforeUpdate` (v6 always re-validates).
- `schema` option name clash (PostgreSQL schema vs Standard Schema) → `validationSchema`.
- Include `order` parsed before include references were resolved.
- PK-less include attributes collapsed rows; empty `through.attributes` produced `{}`.
- v6 itself: `sync` hard-codes `public`, `renameTable` with schema target emits invalid SQL — documented as postgrelize deviations.

## Known gaps
See `decisions/sde/postgrelize-mvp.md` (M3–M5 deviations): default scopes of included models, nested create via include, enum value migration on alter, CJS type entry, bulk insert chunking.

**Verdict:** MVP feature-complete for the scoped v6 surface; ready for a `0.1.0` pre-release.
