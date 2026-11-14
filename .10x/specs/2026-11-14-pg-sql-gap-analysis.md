# PostgreSQL SQL vs Sequelize v6 — Gap Analysis

**Date:** 2026-11-14
**Sources:** PostgreSQL 18 docs (sql-select, sql-insert, sql-update, sql-merge, sql-createtable, sql-createindex, functions-json, functions-array); Sequelize 6.37.8 source (`lib/operators.js`, `lib/data-types.js`, `lib/dialects/abstract/query-generator.js`, `query-interface.js`).
**Baseline:** postgrelize minimum PG = 16. Features needing 17/18 are gated by server version check.

Legend — **Seq v6**: ✅ supported, ◐ partial / only via `literal`, ❌ absent.
Priority — **P0**: MVP (M1–M5), **P1**: next cycle after MVP, **P2**: later / on demand.

## 1. INSERT

| PG feature | Seq v6 | Prio | Notes |
|---|---|---|---|
| `VALUES (...),(...)` multi-row, `DEFAULT` | ✅ | P0 | |
| `RETURNING *` / columns | ✅ | P0 | |
| `ON CONFLICT (cols) DO NOTHING` | ✅ `ignoreDuplicates` | P0 | |
| `ON CONFLICT (cols) DO UPDATE SET c = EXCLUDED.c` | ✅ `updateOnDuplicate`, `conflictAttributes` | P0 | |
| conflict target `WHERE index_predicate` (partial unique index) | ◐ `conflictWhere` (6.37+) | P0 | |
| `ON CONFLICT ON CONSTRAINT name` | ❌ | P0 | |
| conflict target on expression `(lower(email))`, `COLLATE`, opclass | ❌ | P0 | |
| `DO UPDATE SET c = <arbitrary expr>` (increments, `array_cat`, `jsonb ||`) | ❌ | P0 | core motivation |
| `DO UPDATE SET (a,b) = ROW(...)` / `= (sub-SELECT)` | ❌ | P1 | |
| `DO UPDATE ... WHERE condition` (optimistic/versioned upsert) | ❌ | P0 | |
| inserted vs updated per row (`xmax = 0`) | ❌ | P0 | |
| `RETURNING WITH (OLD AS o, NEW AS n)` / `old.*`, `new.*` | ❌ | P1 | PG18 only; gated |
| `INSERT ... SELECT` | ❌ | P1 | |
| `DEFAULT VALUES` | ✅ (empty insert) | P0 | |
| `OVERRIDING SYSTEM / USER VALUE` | ❌ | P1 | needed with identity columns |
| `INSERT ... AS alias` (alias in DO UPDATE) | ❌ | P0 | needed to reference target row cleanly |

## 2. SELECT

| PG feature | Seq v6 | Prio | Notes |
|---|---|---|---|
| WHERE / ORDER / LIMIT / OFFSET / GROUP / HAVING | ✅ | P0 | |
| `ORDER BY ... NULLS FIRST/LAST` | ✅ (`'DESC NULLS LAST'` string) | P0 | |
| `FOR UPDATE / SHARE / NO KEY UPDATE / KEY SHARE`, `OF`, `SKIP LOCKED` | ✅ `lock`, `skipLocked` | P0 | |
| `NOWAIT` | ❌ | P0 | trivial, job-queue use case |
| `DISTINCT ON (...)` | ❌ | P1 | "latest row per group" |
| `WITH` CTE / `RECURSIVE` / `[NOT] MATERIALIZED` / `SEARCH` / `CYCLE` | ❌ | P1 | trees, data-modifying CTE |
| data-modifying CTE (`WITH x AS (UPDATE ... RETURNING)`) | ❌ | P1 | |
| `LATERAL` subquery join | ❌ | P1 | top-N per parent in `include` (better than v6 `groupedLimit`/`separate`) |
| window functions `OVER (PARTITION BY ... ORDER BY ...)`, `WINDOW` | ◐ literal | P1 | |
| `UNION / INTERSECT / EXCEPT [ALL]` | ❌ | P2 | |
| `GROUPING SETS / ROLLUP / CUBE` | ❌ | P2 | |
| `FETCH FIRST n ROWS WITH TIES` | ❌ | P2 | |
| `TABLESAMPLE` | ❌ | P2 | |
| set-returning funcs in FROM (`unnest`, `jsonb_to_recordset`, `JSON_TABLE`), `WITH ORDINALITY` | ❌ | P2 | |
| `ONLY` (inheritance) | ❌ | P2 | |

## 3. UPDATE / DELETE

| PG feature | Seq v6 | Prio | Notes |
|---|---|---|---|
| `UPDATE ... SET c = expr` | ✅ (`literal`/`fn`) | P0 | |
| `UPDATE ... RETURNING` | ✅ `returning: true` | P0 | |
| `DELETE ... RETURNING` (`destroy` returning rows) | ❌ | P0 | cheap; return deleted rows |
| `UPDATE ... FROM other` (join update) | ❌ | P1 | |
| `DELETE ... USING other` | ❌ | P1 | |
| `SET (a,b) = (sub-SELECT)` | ❌ | P2 | |
| `RETURNING old.* / new.*` | ❌ | P1 | PG18 gated |
| `WHERE CURRENT OF cursor` | ❌ | P2 | |
| `UPDATE/DELETE ... LIMIT` (via ctid subquery) | ◐ `limit` on destroy | P1 | |

## 4. MERGE (PG15+, RETURNING + `NOT MATCHED BY SOURCE` PG17+)

| PG feature | Seq v6 | Prio |
|---|---|---|
| `MERGE INTO t USING src ON ... WHEN MATCHED / NOT MATCHED THEN UPDATE/INSERT/DELETE/DO NOTHING` | ❌ | P1 |
| `WHEN NOT MATCHED BY SOURCE` (sync table to snapshot) | ❌ | P1 (PG17 gated) |
| `RETURNING merge_action(), ...` | ❌ | P1 (PG17 gated) |
| source = `VALUES` list / subquery / table | ❌ | P1 |

## 5. Operators (WHERE)

Seq v6 `Op`: eq, ne, gt(e), lt(e), not, is, in, notIn, like/notLike, iLike/notILike, startsWith, endsWith, substring, regexp/notRegexp/iRegexp/notIRegexp, between/notBetween, overlap (`&&`), contains (`@>`), contained (`<@`), adjacent/strictLeft/strictRight/noExtendLeft/noExtendRight (ranges), any, all, match (`@@` tsquery), col, values, placeholder.

| PG feature | Seq v6 | Prio | Notes |
|---|---|---|---|
| All v6 Ops above | ✅ | P0 | compat |
| JSON nested where `{ meta: { a: { b: 1 } } }`, `'meta.a.b'` keys, `::cast` | ✅ | P0 | compat |
| jsonb `?`, `?|`, `?&` (key exists) | ❌ | P0 | new Ops: `hasKey`, `hasAnyKeys`, `hasAllKeys` |
| jsonb `@?`, `@@` jsonpath | ❌ | P1 | `jsonPathExists`, `jsonPathMatch` |
| `IS DISTINCT FROM` / `IS NOT DISTINCT FROM` | ❌ | P0 | null-safe compare |
| `SIMILAR TO` | ❌ | P2 | |
| `= ANY($1::int[])` with single array param (instead of `IN (...)` expansion) | ❌ | P0 | perf: one bind param for large `IN` |
| row comparison `(a,b) > (x,y)` (keyset pagination) | ❌ | P1 | |
| `EXISTS (subquery)` / `IN (subquery)` builder | ◐ literal | P1 | |
| full text: `to_tsvector`, `websearch_to_tsquery`, `ts_rank` helpers | ◐ fn | P1 | |
| range `-|-`, `&<`, `&>` | ✅ | P0 | |
| `ILIKE ANY(array)` | ✅ via `{[Op.iLike]: {[Op.any]: [...]}}` | P0 | |

## 6. Data types

Seq v6: STRING, CHAR, TEXT, CITEXT, INTEGER, SMALLINT, BIGINT, FLOAT, REAL, DOUBLE, DECIMAL, BOOLEAN, TIME, DATE, DATEONLY, HSTORE, JSON, JSONB, BLOB(bytea), RANGE, UUID(+V1/V4 default), VIRTUAL, ENUM, ARRAY, GEOMETRY, GEOGRAPHY, CIDR, INET, MACADDR, TSVECTOR, NOW.

| PG type | Seq v6 | Prio |
|---|---|---|
| All v6 types above | ✅ | P0 (GEOMETRY/GEOGRAPHY: P1, needs PostGIS) |
| `INTERVAL` | ❌ | P1 |
| `MACADDR8`, `MONEY`, `BIT/VARBIT`, `XML`, `POINT/LINE/POLYGON` | ❌ | P2 |
| multirange (`int4multirange`, …) | ❌ | P2 |
| `TIMESTAMP WITHOUT TIME ZONE` explicit | ◐ | P1 |
| domain types, composite types | ❌ | P2 |
| `ltree` (ext) | ❌ | P2 |
| `uuidv7()` default (PG18) / `gen_random_uuid()` DB default | ❌ | P1 |
| arrays of enum / of jsonb | ✅ | P0 |

## 7. DDL (QueryInterface / sync)

Seq v6 QI: createDatabase/dropDatabase, createSchema/dropSchema/showAllSchemas, createTable/dropTable/renameTable/describeTable/tableExists, addColumn/removeColumn/changeColumn/renameColumn, addIndex/removeIndex/showIndex (unique, using, operator, concurrently, where), addConstraint/removeConstraint (check, unique, PK, FK, default), createFunction/dropFunction/renameFunction, createTrigger/dropTrigger/renameTrigger, ENUM management.

| PG feature | Seq v6 | Prio | Notes |
|---|---|---|---|
| All v6 QI methods | ✅ | P0 (M5) | compat |
| `GENERATED ... AS IDENTITY` instead of SERIAL | ❌ | P1 | option `autoIncrement: 'identity'` |
| generated columns `GENERATED ALWAYS AS (expr) STORED/VIRTUAL` | ❌ | P1 | VIRTUAL = PG18 |
| `UNIQUE NULLS NOT DISTINCT` | ❌ | P0 | important for upsert on nullable cols |
| index `INCLUDE (...)` (covering) | ❌ | P1 | |
| index expressions, opclass, `NULLS FIRST/LAST`, `WITH (...)` | ◐ | P1 | |
| `IF NOT EXISTS` on index | ❌ | P1 | |
| `EXCLUDE USING gist` constraints | ❌ | P2 | |
| FK `ON DELETE SET NULL (cols)`, `DEFERRABLE` | ◐ deferrable ✅ | P2 | |
| `PRIMARY KEY/UNIQUE ... WITHOUT OVERLAPS`, FK `PERIOD` | ❌ | P2 | PG18 |
| `NOT ENFORCED` constraints | ❌ | P2 | PG18 |
| partitioning `PARTITION BY` / `PARTITION OF` | ❌ | P2 | |
| `UNLOGGED`, `TEMP` tables | ❌ | P2 | |
| table/column `COMMENT ON` | ✅ comment | P0 | |

## 8. Session / protocol features (not SQL statements)

| Feature | Seq v6 | Prio | Notes |
|---|---|---|---|
| transactions, isolation levels, savepoints, deferrable constraints | ✅ | P0 | |
| `READ ONLY` / `DEFERRABLE` transaction modes | ❌ | P1 | |
| `SET LOCAL` (statement_timeout, search_path, app.user_id for RLS) inside tx | ❌ | P1 | RLS support |
| advisory locks `pg_advisory_xact_lock` helpers | ❌ | P1 | |
| `LISTEN / NOTIFY` | ❌ | P1 | dedicated client from pool |
| `COPY FROM STDIN / TO STDOUT` bulk load | ❌ | P1 | 10–100x faster than bulkCreate |
| server-side cursors / streaming `findAll` (`Model.findEach`) | ❌ | P1 | |
| named prepared statements | ❌ | P2 | |
| `EXPLAIN (ANALYZE, FORMAT JSON)` helper | ❌ | P2 | |
| read replicas (`replication: { read, write }`) | ✅ | P1 | v6 compat; not in original MVP list |

## 9. Changes to MVP scope (proposal)

Added to P0 on top of the approved M1–M5:
- M1: `NOWAIT`; `Op.isDistinctFrom/isNotDistinctFrom`; jsonb key-exists Ops (`?`, `?|`, `?&`); large `IN` lists compiled as `= ANY($n)`; `destroy({ returning: true })`.
- M2: `ON CONSTRAINT`, expression conflict targets, target alias, `DO UPDATE ... WHERE`, arbitrary SET expressions, inserted/updated flag (all already in design section 2).
- M5: `UNIQUE NULLS NOT DISTINCT`.

Everything P1 → "PG power features" cycle after MVP: CTE + `DISTINCT ON` + `LATERAL` include, `MERGE`, `UPDATE FROM`/`DELETE USING`, `COPY`, `LISTEN/NOTIFY`, cursors/streaming, `SET LOCAL`/RLS, advisory locks, identity/generated columns, covering indexes, `INTERVAL`, PG18 `RETURNING old/new`.
P2 → on demand.
