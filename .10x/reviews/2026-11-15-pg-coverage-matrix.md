# PostgreSQL coverage matrix: result and proposed gap stages (S9)

**Date:** 2026-11-15. Replaces the 2026-11-14 gap analysis (`.10x/specs/2026-11-14-pg-sql-gap-analysis.md`), which predates P1/M-stage work.
**Source of truth:** `docs/coverage/postgresql-features.ts`, published as "PostgreSQL coverage" on the docs site. `tests/docs/postgresql-matrix.test.ts` checks every `supported` row against a real test.

## Counts (133 rows)

| Status | Rows |
| --- | --- |
| supported (test-backed) | 69 |
| literal (via `literal()` / `fn()` / raw query / driver option) | 13 |
| planned | 39 |
| out-of-scope (reason given) | 12 |

Method: each row was decided by reading `src/` and running probes against PostgreSQL 18. New tests in `tests/integration/pg-coverage.test.ts` back the supported rows that had no test (data type round trips, operators, lock strengths, indexes, isolation levels, read-only transactions, deferrable FKs, NULLS ordering, bind parameters). Probes found one real defect that is recorded as a gap, not fixed here: `DataTypes.HSTORE` creates the column but object values fail (`syntax error in hstore`).

## Proposed gap stages (for owner approval)

Sizes: S ≈ 1 day, M ≈ 2–3 days, L ≈ 1 week. Each stage = spec, ADR when the API shape is new, tests, guide page + example, matrix rows flipped to `supported`.

| Stage | Theme | Rows closed | Size | Priority |
| --- | --- | --- | --- | --- |
| S11 | **DDL objects**: `createExtension`, views and materialized views (create / refresh / drop), sequences, `createFunction` / `createTrigger` (Sequelize v6 parity gap), RLS policies, UNLOGGED/TEMP tables | Extensions, Views and materialized views, Sequences, Functions and triggers, Row-level security policies, UNLOGGED and TEMPORARY tables | L | High: v6 parity (functions, triggers) and everyday migrations |
| S12 | **Set operations and FROM sources**: `UNION` / `INTERSECT` / `EXCEPT [ALL]`, LATERAL joins (and top-N per parent includes), VALUES / set-returning functions in FROM with ordinality, `JSON_TABLE`, TABLESAMPLE, `FETCH … WITH TIES`, data-modifying CTEs, CTE SEARCH/CYCLE | 8 SELECT rows + JSON_TABLE | L | High: set operations and LATERAL are the most requested query forms |
| S13 | **Constraints and indexes**: EXCLUDE, NOT VALID / VALIDATE, PG18 NOT ENFORCED / WITHOUT OVERLAPS / PERIOD, expression indexes, declarative partitioning (create, attach, detach) | 6 DDL rows | M | Medium: needed for safe online migrations and range-overlap rules |
| S14 | **Types I**: fix `HSTORE` object mapping, `ltree`, `TIMESTAMP WITHOUT TIME ZONE`, `MONEY`, `MACADDR8`, `XML`, `BIT/VARBIT`, `TSQUERY` | 9 type/operator rows | M | Medium: HSTORE is a correctness bug for an existing type, so do it first |
| S15 | **Types II**: geometric types, multirange types and operators, composite types, PostGIS GEOMETRY/GEOGRAPHY round trip (needs a PostGIS test image) | 6 rows | L | Low–medium: needs value-mapping design and an ADR |
| S16 | **Session and write extras**: named prepared statements (coordinate with S10), `DEFERRABLE` transaction mode, per-query statement timeout, bulk insert via `UNNEST` arrays | 4 rows | S–M | Low–medium |
| S17 | **Operator helpers** (promote `literal` rows): jsonpath `Op`s, `SIMILAR TO`, network subnet operators, full-text helpers (`websearch_to_tsquery`, `ts_rank`), `pg_trgm` `%` | up to 8 literal rows | M | Low: workarounds already exist |

Recommended order: S14 (bug) → S12 → S11 → S13 → S16 → S17 → S15. S11 may go first if v6 parity matters more than query power.

## Not planned

The 12 `out-of-scope` rows (roles, replication setup, tablespaces, maintenance commands, procedural languages, extension internals, foreign data wrappers, server configuration, rules, inheritance `ONLY`, system types, two-phase commit) stay out with the reason on the page.
