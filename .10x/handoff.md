# Handoff

**From:** M3 (lifecycle) done → **To:** M4 (associations + include)

- M3 details/deviations: `decisions/sde/postgrelize-mvp.md` (M3 section). User asked to proceed between stages without approval (2026-11-14).
- M4 entry points: `src/model/query-builders.ts` (`buildSelect` — add joins/include), `src/model/model.ts` (findAll result assembly), `src/sql/ast.ts` (`JoinNode` exists; `LATERAL` not yet).
