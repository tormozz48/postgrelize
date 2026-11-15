# QA — postgrelize-mvp (cycle 1: M0–M2)

## Strategy
| Layer | What | Where |
|---|---|---|
| Unit (no DB) | SQL compiler, where/Op, DataTypes, errors, raw query tokenizer, injection surfaces | `tests/unit` |
| Integration (PG) | Sequelize/Model behaviour, PG extensions, transactions/CLS, onConflict | `tests/integration` |
| Differential | same scenario on sequelize@6.37.8 and postgrelize, deep-equal normalized results; scenario must succeed on v6 (or fail for `expectSameError`) | `tests/compat` |
| Types | v6 model typing patterns compile; misuse fails (`@ts-expect-error`) | `tests/types` |
| Build | ESM + CJS entry points load | `tests/build` |

## Results (2026-11-14, local PG16; CI PG16/17/18)
- 123 tests: unit 71, integration 31, compat 24 (CRUD 16, upsert/bulkCreate conflict 8) — all pass. Build smoke 5 pass.
- Coverage ≈ 92% lines overall (model.ts ≈ 80%).

## Bugs found and fixed during the cycle
1. `sequelize.query` with `model`/`plain` and no `type` returned `[rows, result]` (v6: SELECT shape) — fixed, differential test.
2. jsonb key operators serialized key through JSONB serializer (`"size"`) — fixed, unit + integration test.
3. `InferAttributes<Self>` infinite instantiation — fixed (exclude Model base keys first), type test.
4. Security: string `order`, unvalidated `::cast`, comparator, `fn` name, `cast` type — fixed, unit tests.

## Known gaps / not tested
- Hooks, validations (allowNull → ValidationError), scopes, paranoid, associations, QueryInterface — later milestones.
- Very large bulk inserts (> 65535 params) not chunked.
- CJS type resolution (`.d.cts`) not verified with arethetypeswrong.

## Quality gates
CI must pass: lint, format:check, typecheck (incl. type tests), unit, build + smoke, TypeDoc (no undocumented exports), integration + compat on PG 16/17/18.

## Cycle 2 (M3) results
- Differential coverage of v6 lifecycle: hook order for create/update/bulk/individual/destroy/find/count, validation messages and items (type/origin/validatorKey/args), scopes merge, paranoid, optimistic locking — 14 scenarios, all equal.
- Bugs found: missing re-validation after `beforeUpdate` (v6 always re-validates) — fixed; scope error message — fixed; `schema` option name clash (PostgreSQL schema vs Standard Schema) found by type checks — renamed to `validationSchema`.

## MVP final
See `.10x/reviews/2026-11-14-mvp-qa-report.md` — 171 tests, 53 differential scenarios, all equal.

## 2026-11-15 — test isolation (intermittent timeouts)

- Root causes:
  1. Database-wide names were shared by parallel projects and concurrent runs: LISTEN channels, advisory lock keys (`jobs:42` in both integration and docs), type names.
  2. Sequelize v6 `showIndex` filters by `relname` only. It read other schemas' indexes and failed with "could not open relation with OID" when a parallel file dropped its schema.
  3. Advisory-lock ordering tests assumed the first holder wins within 20 ms.
  4. CPU oversubscription when several suites run at once (e.g. parallel agents): compat tests take 2–4 s alone and crossed 15 s.
- Fixes:
  - `tests/support/global-setup-db.ts` creates a database per project per run, provides it via `inject('databaseUrl')`, and drops it `WITH (FORCE)` at teardown.
  - The compat project also gets a database per file (`tests/support/file-database.ts`).
  - Lock-ordering tests signal when the first holder has the lock.
  - DB test and hook timeouts raised to 60 s.
- Verification: 10 sequential and 9 concurrent (3 at a time) full runs, all green; no leftover `pgz_*` databases.

## 2026-11-15 — S5 SQL-injection assurance

- Independent audit + 19 security tests on real PostgreSQL (`tests/integration/security/`): payload corpus, fast-check properties (seed 20261115), canary table, 42601 syntax-error signal.
- 7 findings (F1–F7), all fixed with regression tests; see `.10x/reviews/2026-11-15-injection-review.md`.
- Side finding: v6 parity — `Sequelize#createSchema/showAllSchemas/dropSchema/dropAllSchemas`, `QueryInterface#dropAllSchemas` added (differential test).
- CodeQL `security-extended` workflow added. Policy: ADR-020.
