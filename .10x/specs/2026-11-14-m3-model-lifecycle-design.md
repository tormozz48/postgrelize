# M3 — Model lifecycle: hooks, validations, scopes, paranoid, optimistic locking — Design Spec

**Date:** 2026-11-14
**Status:** Approved by user (2026-11-14)
**Feature slug:** `postgrelize-mvp` (milestone M3)
**Related:** [MVP spec](2026-11-14-postgrelize-mvp-design.md), ADR-008

## Goal
Sequelize v6 behaviour for hooks, validations, scopes, paranoid models and optimistic locking, proven by differential tests. One extension: Standard Schema validation (zod / valibot / arktype).

## Scope
1. **Hooks** — `Model.addHook(type, [name], fn)`, `removeHook`, `hasHook(s)`, named statics (`Model.beforeCreate(fn)`), `hooks` in `init` options, Sequelize-level hooks (`sequelize.addHook`, `define.hooks`) applied to every model.
   Types: `beforeValidate, afterValidate, validationFailed, beforeCreate, afterCreate, beforeUpdate, afterUpdate, beforeSave, afterSave, beforeDestroy, afterDestroy, beforeRestore, afterRestore, beforeUpsert, afterUpsert, beforeBulkCreate, afterBulkCreate, beforeBulkUpdate, afterBulkUpdate, beforeBulkDestroy, afterBulkDestroy, beforeBulkRestore, afterBulkRestore, beforeFind, beforeFindAfterExpandIncludeAll, beforeFindAfterOptions, afterFind, beforeCount`.
   Order and arguments as in v6 (`save`: validate → before{Create|Update} → beforeSave → SQL → after{Create|Update} → afterSave; fields changed in before hooks are saved and re-validated). `hooks: false` and `individualHooks: true` options. Connection/sync/query/define hooks → M5.
2. **Validations** — before INSERT/UPDATE unless `validate: false`:
   - `allowNull: false` → `ValidationErrorItem("<Model>.<attr> cannot be null", 'notNull Violation', attr, value, instance, 'is_null')`; custom message via `validate.notNull.msg`.
   - Attribute validators from validator.js (same names/args as v6) plus v6 extras (`is`, `not`, `isIn`, `notIn`, `len`, `notEmpty`, `min`, `max`, `isUrl` …), `{ args, msg }`, custom sync/async functions.
   - Model-level validators (`validate` option) — errors with `path` = validator name.
   - `ValidationError` message `Validation error: <items>` joined by `,\n` (v6 format), `validationFailed` hook.
   - Only attributes being saved are validated (`fields`, `skip`).
   - **Extension:** `validate: { schema }` on an attribute and `validationSchema` on the model (`schema` keeps its v6 meaning: PostgreSQL schema) accept any Standard Schema v1 object; issues become `ValidationErrorItem`s (`type: 'Validation error'`, `validatorKey: 'schema'`).
3. **Scopes** — `defaultScope`, `scopes` (object or function), `Model.scope(...names | { method: [name, ...args] })` returning a subclass, `unscoped()`, `addScope(name, scope, { override })`; merge rules of v6 (`where`/`having` shallow-assign, `whereMergeStrategy: 'and'`, arrays union, finder options override scope).
4. **Paranoid** — `paranoid: true` (requires timestamps): `deletedAt` attribute (`deletedAt` option renames/disables), finders/count/aggregates add `deletedAt IS NULL` unless `paranoid: false`; `destroy` → `UPDATE SET deletedAt = now()` unless `force: true`; `restore()` static and instance; `isSoftDeleted()`.
5. **Optimistic locking** — `version: true | '<name>'`: INTEGER default 0; instance updates add `WHERE version = n` and `SET version = n + 1`; zero rows → `OptimisticLockError`.

## Non-goals
Associations/include (M4), DDL/sync (M5), DataType validation (`typeValidation`), `beforeConnect`/`beforeSync`/`beforeQuery` hooks (M5).

## Testing
Differential scenarios for every v6 behaviour above; integration tests for Standard Schema (zod as devDependency), type tests for hook/scope typing.
