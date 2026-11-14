# Handoff

**From:** M4 (associations) done → **To:** M5 (QueryInterface + sync + UNIQUE NULLS NOT DISTINCT)

- M4 details/limits: `decisions/sde/postgrelize-mvp.md` (M4 section).
- M5 entry points: DDL AST/compiler (new statements in `src/sql`), `src/query-interface/`, `Sequelize.sync`/`Model.sync`/`drop`, FK constraints from associations (`onDelete`/`onUpdate` defaults like v6), `Deferrable`.
