# CTO — postgrelize-mvp

## Problem
Sequelize v6 targets 6 dialects through a lowest-common-denominator query generator. PostgreSQL users cannot express core PG features through the ORM: expression-based `ON CONFLICT DO UPDATE`, `DO UPDATE ... WHERE`, `ON CONSTRAINT`, CTEs, `MERGE`, `COPY`, `LISTEN/NOTIFY`. They fall back to raw SQL and lose model typing, hooks and instance mapping.

## Build vs buy
| Option | Verdict |
|---|---|
| Keep Sequelize v6 + raw SQL | Status quo; the pain this project exists to remove |
| Sequelize v7 (@sequelize/core) | Still multi-dialect, API break for v6 users, not drop-in |
| Drizzle / Kysely / Prisma | Good PG support but full rewrite of app code; not drop-in |
| Plugin over Sequelize v6 | Cheap, but coupled to Sequelize internals; cannot fix the query generator |
| **Build clean-room TS, v6 API (chosen)** | Only option that is both drop-in and PG-deep |

## Tech direction
TypeScript strict, `pg` driver, PG 16+ (17/18 gated), Node 20+, ESM+CJS. Tooling: vite (build), vitest, oxlint, oxfmt.

## Investment & opportunity cost
MVP (M0–M5) is multi-week. This cycle delivers M0–M2 (tooling, core CRUD, ON CONFLICT) — enough to run real CRUD/upsert workloads and validate the differential-test approach before investing in associations.

## Strategic risks
- Compatibility long tail of v6 → mitigated by differential tests; compatibility is claimed only for covered behaviour.
- Maintenance burden of a full ORM → narrow to one dialect, layered design, no legacy.
