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
