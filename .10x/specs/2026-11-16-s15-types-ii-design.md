# S15 Types II — design

Backlog 4, stage 15. Scope: geometric types, multirange types, composite types, PostGIS `GEOMETRY` / `GEOGRAPHY` round trip. Value shapes: [ADR-026](../adrs/026-types-ii-value-mapping.md). Code stays in `src/data-types/`; the only change outside is `ColumnDdl.defaultSql` serializing object defaults of the new types.

## Delivery (one topic per PR)
1. Spec + ADR + geometric types (`POINT`, `LINE`, `LSEG`, `BOX`, `PATH`, `POLYGON`, `CIRCLE`).
2. `MULTIRANGE(subtype)` (`INT4/INT8/NUM/TS/TSTZ/DATEMULTIRANGE`), `RANGE` gains `TIMESTAMP`.
3. `COMPOSITE(name, fields)` with `createSql()`.
4. PostGIS: GeoJSON ↔ hex EWKB for `GEOMETRY` / `GEOGRAPHY`, optional CI job.
Each PR carries its tests, guide section, matrix rows, README entry and regenerated `llm/`.

## Operators
No new `Op` keys: the existing `Op.contains` (`@>`), `Op.contained` (`<@`), `Op.overlap` (`&&`), `Op.strictLeft` / `Op.strictRight` (`<<`, `>>`), `Op.eq` take the attribute serializer's output, so shapes work as `where` values. Functions and the remaining operators (`<->`, `?#`, `range_agg`, `unnest`, `ST_*`) go through `fn()` / `literal()`; the matrix says so.

## PostGIS testing
Integration tests call `CREATE EXTENSION postgis` inside the test database and skip (`it.skipIf`) when `pg_available_extensions` has no `postgis`. A separate `postgis` CI job (image `postgis/postgis:17-3.5`, `continue-on-error`) runs the file; it is not a required check. Matrix rows reference the skipped-capable tests, which exist in the repo.
