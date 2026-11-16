# ADR-026: Value mapping of geometric, multirange, composite and PostGIS types

**Status:** Accepted · **Date:** 2026-11-16 · **Feature:** S15 Types II · **Author:** Claude (Architect)

## Context
PostgreSQL returns geometric, multirange, composite and PostGIS values as text (or hex EWKB) that the `pg` driver mostly leaves unparsed (`point` and `circle` are the exceptions). Users need JavaScript shapes that round-trip, and every shape is a public API that is costly to change later. Sequelize v6 maps `GEOMETRY` / `GEOGRAPHY` to GeoJSON through `wkx`; it has no geometric, multirange or composite types.

## Decision
- **One shape per type, documented, plain data, no classes.** Each type has `parse` (driver text → shape) and `serialize` (shape → one bound text parameter). Text input is accepted on write, so PostgreSQL literals keep working.
  - `POINT` `{ x, y }`; `LINE` `{ a, b, c }`; `LSEG` and `BOX` `[Point, Point]` (box: PostgreSQL normalizes to upper-right first); `PATH` `{ points: Point[], closed: boolean }`; `POLYGON` `Point[]`; `CIRCLE` `{ x, y, radius }`. `POINT` and `CIRCLE` match what `pg` already returns.
  - `MULTIRANGE(subtype)`: an array of ranges, each range the `[lower, upper]` pair of `{ value, inclusive }` bounds that `RANGE` uses; `[]` is the empty multirange. Reuses the `RANGE` element codec.
  - `COMPOSITE(name, fields)`: an object keyed by field name; each field converted by its own data type; `NULL` ↔ `null`. The type must exist; `createSql()` returns its `CREATE TYPE` statement (name and field names quoted, field types from data types).
  - `GEOMETRY` / `GEOGRAPHY`: GeoJSON objects like v6 (`wkx` shape: `crs: { type: 'name', properties: { name: 'EPSG:<srid>' } }` when the SRID is set). Read side: a small hex EWKB parser (no dependency). Write side: GeoJSON text bound as one parameter and cast by the column type.
- **Values are always bound** as one text parameter; numbers are validated finite before formatting; text input passes through unchanged (it is still bound).
- **DDL type names** are allowlisted (geometric keys, multirange subtype table) or identifiers quoted by `IdentifierQuoter` (composite name and field names). Composite field types come from data types, never from strings.
- **PostGIS is optional**: tests skip when the extension is not available. CI gets a separate non-required `postgis` job; required checks are unchanged.
- New data types only. `RANGE` gains the `TIMESTAMP` subtype (`TSRANGE`) because `tsmultirange` needs the element codec.

## Alternatives Considered
| Alternative | Pros | Cons | Why Not |
|---|---|---|---|
| Keep strings for all types | Zero parsing | No typed access, no object where-values | Users parse text themselves; the matrix row stays planned |
| Wrapper classes (`Point`, `Polygon`) | Methods, validation | New public classes, cross-copy identity, harder JSON | Plain data is JSON-safe and matches v6 / `pg` for point |
| `wkx` for GeoJSON | Complete | New runtime dependency (rule 3) | 60-line EWKB reader covers the GeoJSON subset |
| Composite as tuple arrays | Simple | Loses field names, fragile on reorder | Objects keyed by field name |

## Consequences
+ Typed round trips and `where` values for all four families without new dependencies.
− `LSEG` and `BOX` share the pair shape; the column type decides the meaning.
− Composite fields that are arrays are not parsed (element text is not typed), as for `HSTORE` arrays.
− GeoJSON from a PostGIS `geography` loses Z/M unless present; curved geometries are not supported by the reader and are returned as hex text.
