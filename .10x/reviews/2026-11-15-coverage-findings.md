# S7 coverage — findings (2026-11-15)

Coverage went from 94.4 / 94.2 / 93.5 / 82.6 to **99.7 / 99.5 / 99.2 / 91.7** (lines / statements / functions / branches); thresholds in `vitest.config.ts` are 98 / 98 / 98 / 90. Writing assertions for the missing paths exposed the issues below. Each is pinned by an `it.fails` test (the suite goes red when the bug is fixed, which is the reminder to flip the test and update the docs). Nothing was fixed in S7: these are library changes, planned as a separate parity/bug stage.

## Bugs (postgrelize is wrong)

| # | Where | Problem | Pinned by |
|---|---|---|---|
| 1 | `Model.create(values, { fields })` | Timestamps are not added to an explicit `fields` list (v6 adds them): INSERT fails with NOT NULL on `createdAt`; unlisted attributes are still inserted. **Fixed (S7b-2):** `save` / `create` / `bulkCreate` extend `fields` like v6 | `tests/compat/model-api-parity.test.ts` |
| 2 | `connection/notifications.ts` | A failed reconnect caches the rejected `connect()` promise; LISTEN never recovers | **Fixed in S7b** (`tests/unit/connection/coverage-notifications.test.ts`) |
| 3 | `Sequelize#sync` | `beforeBulkSync` / `afterBulkSync` (and per-model `beforeSync` / `afterSync`) are accepted but never run; v6 fires them | **Fixed in S7b** (`tests/integration/coverage-core.test.ts`, `tests/compat/sync-hooks.test.ts`) |
| 4 | `ConnectionManager` | A backend killed while its client is checked out emits an unhandled `error` on the pooled client and crashes the process (only idle clients have a handler) | **Fixed in S7b** (`tests/integration/coverage-connection.test.ts`) |
| 5 | `Model.schema(name)` | Missing (v6 returns a model clone bound to a schema). **Fixed (S7b-2):** `Model.schema(name, options?)`, `getTableName()` reports the delimiter | `tests/compat/model-api-parity.test.ts` |

## v6 parity differences

| # | Behaviour | v6 | postgrelize | Pinned by |
|---|---|---|---|---|
| 6 | `set` / `setDataValue` back to the stored value | attribute stays marked changed | change flag cleared. **Matched v6 (S7b-2)** | `coverage-instance-values.test.ts`, `tests/compat/model-api-parity.test.ts` |
| 7 | `hasOne` `setX(pk)` | returns a stub from the key, no lookup | loads the row; `null` for unknown key | `coverage-has-one.test.ts` |
| 8 | `hasOne` `setX(sameInstance)` | `null` | the instance | `coverage-has-one.test.ts` |
| 9 | Include with a wrong alias; model included twice without alias | `SequelizeEagerLoadingError` | plain `Error` | `coverage-association-accessors.test.ts` |
| 10 | Unknown validator name | `SequelizeValidationError` | plain `Error("Invalid validator function")` | `coverage-validation.test.ts` |
| 11 | `getX({ joinTableAttributes: [] })` on belongsToMany | junction row omitted | junction row returned | `coverage-association-accessors.test.ts` |
| 12 | `Model.aggregate(..., { plain: false })` | strings (`'6'`) | numbers. **Matched v6 (S7b-2)**: raw rows; new `dataType` option | `tests/compat/model-api-parity.test.ts` |
| 13 | Raw `QueryTypes.DELETE` / `UPDATE` / `UPSERT` results | `[]` / `[undefined, null]` | row count / `[rows, rowCount]` | asserted as postgrelize behaviour |
| 14 | `getX({ raw: true })` on belongsToMany | works | TypeError | not pinned |
| 15 | Nested `through: { attributes }` | keeps junction PK | omits it | not pinned |
| 16 | `belongsTo.setX(x, { save: false })`; `hasHooks` of a missing hook; `instance._model` | `undefined`; `undefined`; absent | instance; `false`; present. `hasHooks` **matched v6 (S7b-2)**, `_model` kept; `setX({ save: false })` is S7b-3 | `tests/compat/coverage-model-api.test.ts` |
| 17 | Nested `create` with a built instance as child | child dropped | child saved and linked | asserted as postgrelize behaviour |

## Left uncovered on purpose
Decorator-plugin artefacts (`access.has/get` closures of `@bulkHooks` on private methods), defensive branches that the public API cannot reach (`include-sub-query.ts` `TRUE` fallback, `condition-compiler.ts` unsupported-operator default, `model-accessors.ts` duplicate alias), rollback `.catch` after a dead connection, PostgreSQL 17+ merge paths (covered in CI on 17/18), unused pg protocol message handlers.

## Dead code removed
`MetadataStore.forCall` (`src/decorators/model-metadata.ts`), no callers.

## Proposed follow-up
A "parity and robustness" stage: fix 1–5, decide for each of 6–17 whether to match v6 or document as a deliberate divergence (ADR-016: parity regressions are fixed to match v6; improvements go to `docs/sequelize-issues.md`). The owner decides 6, 12, 13 and 17.
