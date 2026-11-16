# Feature examples: every beyond-v6 feature is documented and proven (2026-11-16)

## Requirement

Each postgrelize feature beyond Sequelize v6 has (1) a complete runnable example, (2) a guide section that says what it does, when to use it and which PostgreSQL version it needs, and links the example, (3) CI that runs the example. Audit: `.10x/reviews/2026-11-16-feature-example-audit.md`.

## Design

- **Data model.** `docs/coverage/postgresql-features.ts`: every `supported` row carries `beyondV6: boolean` (forces a decision per row). When `true`, the row also carries `example` (`<file>.ts#<region>`, relative to `docs/examples`) and `guide` (`<page>#<anchor>`, page in `docs/guide` or `docs/`). Non-SQL features (decorators, Standard Schema, `Model.insert`) live in `EXTRA_FEATURES` with the same fields and a `test` reference.
- **Display.** The coverage page gets a "Docs" column: Guide and Example links, or "same as v6".
- **Enforcement** (`tests/docs/feature-examples.test.ts`, `docs` project, runs in CI): the example file exists, exports `run`, has the region; the guide page has the anchor (explicit `{#id}` or the VitePress slug of a heading) and that **section** includes `<<< @/examples/<file>#<region>`. A `KNOWN_GAPS` allow-list holds features that still lack an example; the test fails when an entry is complete (it only shrinks) and when it names an unknown feature.
- **Execution.** `tests/docs/examples.test.ts` already runs every example against PostgreSQL and fails when `run` rejects. Changed: it asserts `run` is exported, and a `minimumServerVersion` skip uses `skip()`, so the report shows it as skipped instead of passed.
- **Process.** AGENTS.md documentation sync table and the PR template require the three fields for any new beyond-v6 feature.

## Rejected

- A free-text list of features outside the matrix: it would drift. Reusing the matrix row shape keeps one checker.
- Executing the guide code blocks directly: they already come from the examples through includes, so the examples are the single source.

## Rollout

1. PR 1: audit, spec, fields, test with 3 known gaps, docs, AGENTS/PR template.
2. PR 2: backfill examples and guide text for the gaps (`NULLS FIRST / LAST`, `OVERRIDING`, `= ANY`); `KNOWN_GAPS` becomes empty.
3. Final: rows from S13 (partitioning, PG18 constraints) and S15 (PostGIS) after their PRs merge.
