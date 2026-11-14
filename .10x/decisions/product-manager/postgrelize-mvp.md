# Product Manager — postgrelize-mvp

## Users
1. **Migrating team**: existing Sequelize v6 + PG app; wants PG features without rewriting models.
2. **New project**: wants Sequelize-familiar API with first-class PG.

## User stories (this cycle: M0–M2)
- US1: As a migrating dev, I change `from 'sequelize'` to `from 'postgrelize'` and my CRUD, where/Op queries and transactions behave identically.
- US2: As a dev, I upsert rows with expression updates (`hits = hits + EXCLUDED.hits`) via the model API, getting typed instances back.
- US3: As a dev, I upsert only when incoming data is newer (`DO UPDATE ... WHERE version < EXCLUDED.version`).
- US4: As a dev, I target a partial unique index or a named constraint in ON CONFLICT.
- US5: As a dev, I know per row whether it was inserted or updated (`wasInserted`).
- US6: As a dev, I lock rows with `NOWAIT`, compare null-safely, query jsonb keys, delete with RETURNING.
- US7: As a contributor, I run `npm run lint|format:check|typecheck|test|build` and CI shows the same.

## Later cycles
M3 hooks/scopes/paranoid/validations, M4 associations/include, M5 QueryInterface/sync. P1 "PG power features" backlog per gap analysis.

## Success criteria
See spec §1. Acceptance for this cycle: US1–US7 each covered by at least one test (differential for US1, integration for US2–US6, CI run for US7).

## Out of scope
Other dialects, v7 API, CLI, npm publish, P1/P2 features.
