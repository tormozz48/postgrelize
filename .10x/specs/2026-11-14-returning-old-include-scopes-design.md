# RETURNING old values (PG18) + default scopes of included models — design

**Date:** 2026-11-14 · **Feature slug:** `postgrelize-mvp` (backlog) · **ADR:** 015

## 1. RETURNING old values (PostgreSQL 18+, extension)

### API
- New option `returningOld?: boolean` on:
  - `Model.update(values, { where, returning: true, returningOld: true })`;
  - `Model.insert(rows, { onConflict, returningOld: true })` and `Model.insertFrom(...)`;
  - `Model.merge({ ..., returning: true, returningOld: true })`.
- Each returned instance gets `instance.oldValues`: attribute-keyed values of the row **before** the
  statement (`Readonly<Record<string, unknown>>`), or `null` when there was no previous row (inserted
  by `INSERT`/`ON CONFLICT`/`MERGE ... INSERT`). `undefined` for instances not produced with `returningOld`.
- On PostgreSQL < 18: `Error('returningOld requires PostgreSQL 18 or newer')`, no SQL sent.
- `returningOld` without `returning: true` on `update`/`merge` → error (nothing would be returned).
- `update` with `individualHooks` keeps working; old values come from the RETURNING clause as well.

### SQL
`... RETURNING WITH (OLD AS "__pgz_old") <new columns>, "__pgz_old"."<field>" AS "__pgz_old.<attr>", ...`
The alias avoids clashes with tables/aliases named `old`. "No previous row" = all primary-key old columns NULL.

### Not in scope
`destroy` (old row == returned row), `NEW` alias for DELETE, instance `save()`/`increment()`.

## 2. Default scopes of included models (v6 compatibility)

v6 `_validateIncludedElement` injects the target model's scope into each include **before** deciding
`required`: `model._injectScope(include)` where model is the include's `model` when it is a scoped class
(`Model.scope(...)` / `unscoped()`), else the association target (→ its default scope).

### Behaviour to match
- Default scope `where` of the included model is merged into the include `where` with the model's
  `whereMergeStrategy` (include options win); a scope `where` therefore makes the include required
  (INNER JOIN) unless `required: false` is given — same as v6.
- Scope `attributes`, `include` (union), and other keys merge like top-level `_injectScope`.
- `include: [{ model: Target.unscoped() }]` / `Target.scope('x')` select the scoped class's scope.
- Applies to joined and `separate` includes, nested includes, `through` excluded (v6: pseudo includes are not scoped).
- `resolveAssociation` must accept scoped subclasses of the target (compare by model state, not identity).

## Testing
- Differential vs sequelize@6: default scope where/attributes on hasMany/belongsTo includes, `required`
  side effect, `unscoped()` and named scope as include model, nested include with default scope, separate include.
- Integration (PG18 only, skipped below 18; clear error asserted below 18): update / insert onConflict /
  insertFrom / merge with `returningOld`.
