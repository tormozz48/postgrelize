# M5 — QueryInterface, sync, constraints — Design Spec

**Date:** 2026-11-14 · **Status:** Accepted (autonomous mode) · **Feature:** `postgrelize-mvp` (M5) · ADR-010

## Scope (Sequelize v6 parity, PostgreSQL)
1. `sequelize.getQueryInterface()` with: `createSchema`, `dropSchema`, `showAllSchemas`, `createTable` (ENUM types created first, `COMMENT ON COLUMN`, composite PKs, `references`/`onDelete`/`onUpdate`/`deferrable`, `unique` incl. named composite keys), `dropTable` (`cascade`), `dropAllTables`, `renameTable`, `tableExists`, `showAllTables`, `describeTable` (v6 result shape), `addColumn`, `removeColumn`, `changeColumn`, `renameColumn`, `addIndex` (`fields` incl. `{ name, order, collate, operator }`, `unique`, `using`, `where`, `concurrently`, `name` default `underscore(table_fields)`, `include`), `removeIndex`, `addConstraint` (`check`, `unique`, `primary key`, `foreign key`), `removeConstraint`, `dropEnum`, `dropAllEnums`, `bulkInsert`, `bulkUpdate`, `bulkDelete`, `sequelize` property, `queryGenerator`-free.
2. `Model.sync({ force, alter })`, `Model.drop()`, `sequelize.sync({ force, alter })` in foreign-key dependency order, `sequelize.drop()` in reverse order. `alter` adds missing columns, alters type / nullability / default of existing ones, drops columns absent from the model (unless `alter: { drop: false }`), adds missing FK constraints.
3. Model `indexes` option; FK constraints from associations with v6 defaults (`belongsTo`/`hasMany`/`hasOne`: `ON DELETE SET NULL` when nullable else `NO ACTION`, `ON UPDATE CASCADE`; `belongsToMany` junction: `CASCADE`/`CASCADE`), `constraints: false` disables.
4. `Deferrable` (`INITIALLY_IMMEDIATE`, `INITIALLY_DEFERRED`, `NOT`, `SET_DEFERRED`, `SET_IMMEDIATE`).
5. **PostgreSQL extension:** `UNIQUE NULLS NOT DISTINCT` — attribute `unique: { name?, nullsNotDistinct: true }` and index `nullsNotDistinct: true`.

## Non-goals
`sequelize-cli` itself, triggers/functions DDL (`createFunction`, `createTrigger`), materialized views, partitioning (P2).

## Testing
Differential: `describeTable` after `sync` on both libraries; `alter` round-trips; FK cascade behaviour. Integration: every QueryInterface method, NULLS NOT DISTINCT, an umzug-style migration up/down smoke test.
