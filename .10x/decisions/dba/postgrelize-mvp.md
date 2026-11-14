# DBA — postgrelize-mvp (cycle 1: M0–M2)

The library owns no schema; these are the database-facing decisions in generated SQL.

- **Parameters:** every value is bound (`$n`); plans are cacheable, no inlined literals (ADR-002).
- **Large IN lists:** > `inAsAnyThreshold` (100) items compile to `= ANY($1)` / `<> ALL($1)` — one parameter, stable statement text, avoids the 65535-parameter limit for `IN`.
- **ON CONFLICT:** arbiter inference requires a matching unique index / constraint; partial index targets must repeat the index predicate (`target.where`). `DO UPDATE ... WHERE` still locks conflicting rows that are not updated.
- **Inserted flag:** `(xmax = 0)` in `RETURNING` — true for freshly inserted tuples; relies on documented MVCC behaviour, tested on PG 16/17/18.
- **DELETE with limit:** `ctid IN (SELECT ctid ... LIMIT n)` — acceptable for ad-hoc limits; not suitable for partitioned tables (ctid not unique across partitions) — documented limitation.
- **Session:** `TimeZone` set via connection `options` (`-c TimeZone=+00:00`), no extra round-trip.
- **Locks:** `FOR UPDATE / NO KEY UPDATE / SHARE / KEY SHARE`, `OF`, `SKIP LOCKED`, `NOWAIT`.
- **Bulk inserts:** one multi-row INSERT; callers must keep rows × columns < 65535 parameters (chunking not implemented — tech debt).

## M5 — DDL notes
- DDL cannot use bind parameters; values are rendered with `escapeLiteral` (ADR-010), identifiers with `quoteIdent`; `DEFAULT`/`CHECK`/partial-index predicates reuse the where compiler then inline values.
- Enum types follow v6 naming `enum_<table>_<column>` and are created idempotently (`DO ... EXCEPTION WHEN duplicate_object`); `Model.drop()` drops them.
- Association FKs: belongsTo/hasMany/hasOne `ON DELETE SET NULL` (nullable) / `NO ACTION`, `ON UPDATE CASCADE`; junction tables `CASCADE`/`CASCADE` — same as v6.
- `UNIQUE NULLS NOT DISTINCT` (PG15+) available via attribute `unique: { nullsNotDistinct: true }` and index option — fixes upsert arbitration on nullable keys.
