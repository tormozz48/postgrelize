# S4 — Functional core on Effect

**Date:** 2026-11-15 · Roadmap: `2026-11-14-backlog-2-roadmap-design.md` · ADR-017 · Owner decision: 10% performance budget

## Goals
- Effect (v4) as the internal effect system: typed error channel, resource safety for pool clients and
  transactions, composable programs.
- Public Sequelize v6 API unchanged and Promise-based; the differential suite passes unchanged.
- Opt-in `postgrelize/effect` entry point for Effect users.
- Performance: stub-mode benchmark (`bench/orm.bench.ts --stub`, ORM overhead only) within budget:
  geometric mean of per-case ratios ≤ 1.10 and no case above 1.20 versus `bench/baseline.json`
  (`bench/compare.ts`). I/O-mode numbers are informational (±50% run-to-run).

## Measured constraints
- `Effect.runPromise` of a small program costs 0.3–1 µs; `findByPk` overhead is ~9 µs. Therefore exactly one
  `runPromise` per public call, Effect at the connection / transaction layer, plain functions on per-row paths.
- Effect 4 `runPromise` rejects with the original failure, so v6 error classes travel through the error
  channel unchanged (no wrapper types, no re-mapping at the boundary).

## Delivery (incremental, each step merged with the full suite green)
1. **Connection layer** (`src/connection/`): `ConnectionManager` gets Effect programs — client acquisition as
   `acquireRelease`, `execute`, `copyFrom` / `copyTo` scoped clients, `close`; errors typed as the v6
   connection / database error classes. The Promise methods become thin `runPromise` wrappers.
2. **Transactions** (`src/transaction/`): begin / commit / rollback / savepoints as `acquireUseRelease`
   over a scoped client; managed transactions commit or roll back from the `Exit`; CLS unchanged.
3. **Effect entry point** `postgrelize/effect`: `query`, `transaction` (Effect-returning, scoped), and model
   operations (`findAll`, `findOne`, `findByPk`, `count`, `create`, `bulkCreate`, `update`, `destroy`, `upsert`,
   `insert`) returning `Effect<A, DatabaseError | ...>`. Separate build entry and docs page.
4. Later steps (own PRs): query pipeline, hooks and validation as Effect programs where it reduces code.

## Out of scope
- Replacing the class shell (ADR-005 keeps the v6 class API), Effect Schema for validation (Standard Schema stays).

## Testing
- Existing unit / integration / compat / docs suites unchanged and green.
- New unit tests for the Effect programs (resource release on failure / interruption).
- Integration tests for `postgrelize/effect` (typed failures, transaction rollback on failure and interruption).
- Benchmark gate run before merge, numbers recorded in the PR.
