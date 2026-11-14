# Backlog — Read replicas and nested creation — Design Spec

**Date:** 2026-11-14 · **Status:** Accepted (autonomous mode) · **Feature:** `postgrelize-mvp` (v6 compat) · ADR-014

## Read replicas (Sequelize v6 `replication`)
- `new Sequelize({ replication: { read: [config, ...], write: config }, ... })`; each entry (`host`, `port`, `username`, `password`, `database`) inherits missing values from the top-level options.
- One `pg` pool for the writer and one per reader (same pool options).
- Routing: SELECT queries (model finders, `count`, aggregates, `copyTo`, `sequelize.query` with SELECT type) go to readers round-robin **unless** they run in a transaction or `useMaster: true` is passed; everything else uses the writer. Transactions always use the writer.

## Nested creation (Sequelize v6 `include` in `build` / `create` / `bulkCreate`)
- `Model.build(values, { include })` / `create(values, { include })` build associated instances from nested values (`{ name, Posts: [{ title }], Profile: { bio } }`), recursively.
- `save()` of a new record with includes: belongsTo targets saved first and the FK set; then the record; then hasOne / hasMany children with FK (and association scope) set, and belongsToMany targets saved plus junction rows (with values from `target[throughModelName]`). Hooks of nested saves run (v6).
- `bulkCreate(records, { include })` creates rows one by one with the same nested logic.

## Testing
Differential (vs sequelize@6) for nested create shapes and resulting rows; integration for replica routing using a dedicated read-only role that marks which pool served a query.
