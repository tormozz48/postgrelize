# M4 — Associations and eager loading — Design Spec

**Date:** 2026-11-14 · **Status:** Accepted (autonomous mode, user 2026-11-14) · **Feature:** `postgrelize-mvp` (M4) · ADR-009

## Scope (Sequelize v6 parity)
1. `belongsTo`, `hasOne`, `hasMany`, `belongsToMany` (through model or table name) with options `as` (string or `{ singular, plural }`), `foreignKey` (string or `{ name, allowNull, field }`), `sourceKey`, `targetKey`, `otherKey`, `through: { model, scope }`, association `scope`. Default names as v6 (`UserId`, `Posts`, inflection singular/plural, `underscored` fields). FK attributes are added to the owning model.
2. `Model.associations` registry and association objects (`associationType`, `source`, `target`, `as`, `foreignKey`, `sourceKey`, `targetKey`, `through`, `otherKey`, `accessors`, `isSingleAssociation`, `isMultiAssociation`).
3. Instance accessors: belongsTo/hasOne `get/set/create<As>`; hasMany/belongsToMany `get/count/has/set/add/remove/create<As>` (singular/plural forms as v6).
4. `include` in `findAll` / `findOne` / `findByPk` / `findAndCountAll` / `count`: model or `{ model, as, association, where, required, right, attributes, include, separate, through: { attributes, where }, order (separate only), limit (separate only), paranoid }`; `include: { all: true }`; nested includes; `order` by included attributes (`[[{ model, as }, 'attr', 'DESC']]`, `[['as', 'attr', 'DESC']]`); `$nested.attr$` where.
5. SQL strategy = v6: one SELECT with LEFT OUTER / INNER JOINs; columns aliased `"<path>.<attr>"`, table aliases `"<as>->..."`; rows deduplicated into instance trees by primary keys. `limit`/`offset` with non-separate multi includes → main model in a subquery (v6 `subQuery`), required multi includes as `EXISTS`-style filter inside the subquery. `separate: true` (hasMany) → second query `WHERE fk IN (...)`.
6. `raw: true` returns flattened joined rows with `"posts.title"` keys (v6), `nest: true` nests them.
7. Instances: included values in `dataValues[as]`; belongsToMany targets carry the through instance under the through model name; `get({ plain: true })` / `toJSON()` recurse.

## Non-goals
`LATERAL`/`json_agg` loading strategy (P1), `include` in `update`/`destroy`, nested creation via `include` in `create`/`bulkCreate` (P1), association hooks, `beforeAssociate`, DDL constraints (M5).

## Testing
Differential scenarios on a Users/Profiles/Posts/Comments/Roles(+UserRoles) schema for every item above; integration for accessors edge cases; type tests for association/include typing.
