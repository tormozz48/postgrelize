# Engineering Manager — postgrelize-mvp (cycle 1: M0–M2)

## Task breakdown
| ID | Task | Est | Depends | Story |
|---|---|---|---|---|
| **M0** | | | | |
| T01 | package.json, tsconfig(s), oxlint/oxfmt config, scripts | 2h | — | US7 |
| T02 | vite lib build (ESM+CJS+dts), `src/index.ts` stub, build smoke test | 2h | T01 | US7 |
| T03 | vitest projects (unit/integration/compat), docker-compose PG16, test schema helper, `runBoth` compat helper skeleton | 3h | T01 | US7 |
| T04 | GitHub Actions CI (PG16/17/18 matrix) | 1h | T02,T03 | US7 |
| **M1** | | | | |
| T05 | `sql/ast` + `sql/compile` (select/insert/update/delete, quoting, params) | 4h | T03 | US1 |
| T06 | `expressions` (literal, fn, col, cast, json) + `Op` symbols | 3h | T05 | US1 |
| T07 | `where` compiler: all v6 Ops, and/or/not, nested JSON paths, arrays/ranges, P0 Ops (isDistinctFrom, hasKey*, IN→ANY) | 4h | T06 | US1,US6 |
| T08 | `data-types` (v6 set) + parse/serialize | 4h | T05 | US1 |
| T09 | `errors` classes + `mapPgError` | 2h | — | US1 |
| T10 | `connection` (pool, executor, option mapping) + `Sequelize` shell (ctor, authenticate, close, query, define/model registry) | 4h | T08,T09 | US1 |
| T11 | `transaction` (managed/unmanaged, isolation, savepoints, CLS) | 4h | T10 | US1 |
| T12 | `model-definition` normalize + `Model.init/define/build` + instance get/set/changed/previous/toJSON | 4h | T08,T10 | US1 |
| T13 | `query` builders + Model finders: findAll/findOne/findByPk/count/aggregate/max/min/sum/findAndCountAll (no include), attributes/order/group/having/limit/offset/lock/noWait | 4h | T07,T12 | US1,US6 |
| T14 | Model writes: create/bulkCreate/save/update (static+instance)/destroy (+returning)/increment/decrement/reload/truncate/findOrCreate/findOrBuild | 4h | T13 | US1,US6 |
| T15 | Differential suite M1 (CRUD, where/Op, aggregates, transactions, errors) + fixes | 4h | T14,T11 | US1 |
| **M2** | | | | |
| T16 | v6 conflict options: upsert (conflictFields), bulkCreate updateOnDuplicate/conflictAttributes/conflictWhere/ignoreDuplicates + differential tests | 3h | T15 | US1 |
| T17 | `onConflict` normalize/validate + `excluded()` + `buildOnConflict` AST/compile | 4h | T16 | US2–US4 |
| T18 | wire `onConflict` into create/bulkCreate/upsert + `Model.insert()` + `wasInserted` | 3h | T17 | US2–US5 |
| T19 | Integration suite for onConflict (expressions, DO UPDATE WHERE, ON CONSTRAINT, partial index, flags) | 3h | T18 | US2–US5 |

Total ≈ 62h.

## Sequencing
M0 → T05..T09 (T08, T09 parallelizable with T05–T07) → T10 → T11/T12 → T13 → T14 → T15 → M2.

## Risks / unknowns
| Risk | Mitigation |
|---|---|
| TypeScript 7 (native) vs `vite-plugin-dts` (uses TS JS API via volar) | Pin TypeScript 6.0.x; revisit when plugin supports TS7 |
| oxfmt pre-1.0 (0.78) | Pin exact version; if blocking → ask user |
| v6 TS type compat is large | Port types incrementally per task; full type-compat check deferred to end of M4 |
| Differential tests flakiness | Fresh schema per scenario, normalized timestamps/ids |

## Cycle 2: M3 (2026-11-14)
| ID | Task | Est | Depends |
|---|---|---|---|
| T20 | hooks registry + runner; wire into save/create/update/destroy/upsert/bulk*/find/count; Sequelize-level hooks | 5h | — |
| T21 | validation: notNull, validator.js, custom, model-level, Standard Schema, validationFailed | 5h | T20 |
| T22 | scopes: defaultScope, scope(), unscoped(), addScope, merge rules | 4h | T20 |
| T23 | paranoid: deletedAt, soft destroy, force, restore, paranoid:false | 3h | T22 |
| T24 | optimistic locking (version) | 2h | — |
| T25 | differential + integration + type tests, docs | 4h | all |
