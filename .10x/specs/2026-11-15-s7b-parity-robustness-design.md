# S7b — Parity and robustness

**Date:** 2026-11-15 · **Status:** planned (defaults below follow ADR-016; the owner may override any row) · **Source:** `.10x/reviews/2026-11-15-coverage-findings.md`

Fixes the bugs and Sequelize v6 differences found while raising coverage in S7. It comes before S8 (API docs), so the docs describe the final behaviour, and before S10 (performance), so the benchmarks measure the final code.

## Rules (ADR-016)
- A postgrelize result that differs from v6 and is **not** a fix of a v6 bug is a parity regression: fix it to match v6 and cover it with a differential test (`tests/compat`).
- A v6 bug stays fixed: keep our behaviour, document it in `docs/sequelize-issues.md`, test in `tests/integration/sequelize-issues.test.ts`.
- Every item flips its `it.fails` test to `it` and removes the `TODO(parity)` comment in the same PR.

## A. Bugs (postgrelize is wrong)

| # | Fix | Where | Test |
|---|---|---|---|
| 1 | `Model.create(values, { fields })`: add `createdAt`/`updatedAt` to an explicit `fields` list like v6, and insert only the listed attributes (plus timestamps, plus the primary key default) | `model/operations/create-operation.ts`, `model-values.ts` | flip `coverage-model-operations.test.ts` "create with an explicit fields list"; add compat case for `bulkCreate({ fields })` |
| 2 | LISTEN reconnect: do not cache the rejected `connect()` promise; clear `#client` on failure so the 1 s retry loop and later `listen()` calls reconnect | `connection/notifications.ts` | flip `coverage-notifications.test.ts` "keeps retrying after a failed reconnect attempt" |
| 3 | Run `beforeBulkSync` / `afterBulkSync` around `Sequelize#sync` and `beforeSync` / `afterSync` around each model's sync, in v6 order and with v6 arguments (options) | `sequelize/sequelize-schema.ts`, `query-interface/schema-synchronizer.ts` | flip `coverage-core.test.ts`; add compat case on call order |
| 4 | A pooled client that errors while checked out must not crash the process: attach an `error` listener on every client at checkout (removed at release), mark the client broken (`release(err)`) so the pool drops it; the in-flight query rejects with the mapped error | `connection/connection-manager.ts` | new integration test (kill the backend with `pg_terminate_backend`, assert a rejected query, a healthy pool afterwards and no uncaught exception) |
| 5 | `Model.schema(name)` (v6): returns a model class bound to the schema, same pattern as `scope()`; also `Model.getTableName()` for it | `model/mixins/` (new `model-schema-binding` mixin or in `ModelScopes`), `model-registry.ts` | new compat test against v6 |

## B. v6 differences — default decision

| # | Behaviour | Default | Reason |
|---|---|---|---|
| 6 | `set` / `setDataValue` back to the stored value | **match v6** (attribute stays changed) | parity regression; affects `changed()` and which columns `save()` writes |
| 7 | `hasOne` `setX(pk)` | **match v6** (stub from the key; no lookup) | observable return value |
| 8 | `hasOne` `setX(sameInstance)` returns `null` | **match v6** | observable return value |
| 9 | Wrong alias / model included twice without alias | **match v6**: throw `EagerLoadingError` (class already exported) with v6's message | error class is part of the contract |
| 10 | Unknown validator name | **match v6**: `ValidationError` | error class |
| 11 | `getX({ joinTableAttributes: [] })` | **match v6** (omit the junction row) | parity |
| 12 | `Model.aggregate(..., { plain: false })` returns numbers, v6 strings | **match v6** | parity; document the `dataType` option for numeric results |
| 13 | Raw `QueryTypes.DELETE` / `UPDATE` / `UPSERT` result shape | **match v6** | parity |
| 14 | `getX({ raw: true })` on belongsToMany throws `TypeError` | **fix** (works like v6) | crash |
| 15 | Nested `through: { attributes }` omits the junction PK | **match v6** | parity |
| 16 | `belongsTo.setX(x, { save: false })` return value; `hasHooks` of a missing hook; `instance._model` | **match v6** for the first two; keep `_model` (harmless extra) | parity |
| 17 | Nested `create` with a built instance as a child: v6 silently drops it | **keep ours (saves and links) and document** in `docs/sequelize-issues.md`; test in the issues suite | v6 data loss is a bug (ADR-016) |

Rows with an owner-visible trade-off are 6, 12, 13 and 17. If the owner prefers our behaviour for any of them, the row moves to "document as divergence" with the same test turned into an integration test.

## Delivery
Three PRs, parallel sessions in own worktrees (file-disjoint):
1. **Connection and sync (items 2, 3, 4):** `connection/*`, `sequelize/*`, `query-interface/schema-synchronizer.ts`.
2. **Model API (items 1, 5, 6, 12, 16):** `model/*`, `decorators` untouched.
3. **Associations, validation, raw queries (items 7–11, 13–15, 17):** `associations/*`, `validation/*`, `query/*`.

Each PR: all `it.fails` tests of its items flipped, `docs/sequelize-issues.md` updated, coverage thresholds still met (`npm run test:coverage`), bench gate for hot-path files, `.10x/reviews/2026-11-15-coverage-findings.md` marks fixed rows.

**Done when:** no `it.fails` marker remains (except documented v6-bug divergences, which are plain tests), and the findings note lists every row as fixed, matched, or documented.
