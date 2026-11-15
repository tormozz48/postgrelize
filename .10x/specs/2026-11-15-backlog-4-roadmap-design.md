# Backlog 4 — PostgreSQL gap stages

**Date:** 2026-11-15 · **Status:** queue recorded; each stage still needs its own spec (and an ADR where noted) before implementation · **Source:** `.10x/reviews/2026-11-15-pg-coverage-matrix.md`

Backlog 3 (S5–S10) delivered injection assurance, the refactor, the PostgreSQL matrix, coverage, parity, API/LLM docs and performance work. Backlog 4 closes the `planned` rows of the matrix. Each stage ships as its own PR(s) with tests, guide pages, matrix rows flipped to `supported` and, for new SQL inputs, rows on `docs/security.md` (ADR-020).

## Queue (recommended order)

| Order | Stage | Scope | Size | Notes |
|---|---|---|---|---|
| 1 | S14 Types I | Fix `HSTORE` object mapping (bug), `ltree`, `TIMESTAMP WITHOUT TIME ZONE`, `MONEY`, `MACADDR8`, `XML`, `BIT/VARBIT`, `TSQUERY` | M | First: HSTORE is a correctness bug in an existing type |
| 2 | S12 Set operations and FROM sources | `UNION` / `INTERSECT` / `EXCEPT [ALL]`, LATERAL (and top-N per parent includes), VALUES / set-returning functions in FROM, `JSON_TABLE`, TABLESAMPLE, `FETCH … WITH TIES`, data-modifying CTEs, CTE SEARCH/CYCLE | L | Most requested query forms; ADR for the AST extension |
| 3 | S11 DDL objects | `createExtension`, views and materialized views, sequences, `createFunction` / `createTrigger` (v6 parity gap), RLS policies, UNLOGGED/TEMP tables | L | May go first if v6 parity matters more than query power |
| 4 | S13 Constraints and indexes | EXCLUDE, NOT VALID / VALIDATE, PG18 NOT ENFORCED / WITHOUT OVERLAPS / PERIOD, expression indexes, declarative partitioning | M | Online migrations |
| 5 | S16 Session and write extras | Named prepared statements, `DEFERRABLE` transaction mode, per-query statement timeout, bulk insert via `UNNEST` | S–M | Coordinate prepared statements with S10 results |
| 6 | S17 Operator helpers | jsonpath `Op`s, `SIMILAR TO`, network subnet operators, full-text helpers, `pg_trgm` `%` | M | Workarounds exist (`literal`) |
| 7 | S15 Types II | Geometric, multirange, composite, PostGIS round trip | L | ADR for value mapping; PostGIS test image in CI |

The owner may reorder; the only hard dependency is that S12 and S13 touch the SQL AST and DDL generator, so they do not run in parallel with each other.

## Other backlog items

- **S10 leftovers:** ungated `transaction + update` and `count where` cases were +12–20% after S6; tracked in `2026-11-15-s10-performance-design.md`.
- **Release 0.9.0** (S5–S10): needs the maintainer's explicit approval, after S10 finishes.
- **Deliberate v6 divergences kept:** nested `create` with a built child instance (documented in `docs/sequelize-issues.md`); `instance._model` extra member.
- **Public decorator API:** no open items; extend only on user demand.

## Gates for every stage

- Spec (and ADR when the decision is costly to reverse) before code; docs, TSDoc and examples in the same PR (AGENTS.md, Documentation sync).
- Matrix row flipped with a `test` reference; `tests/docs/postgresql-matrix.test.ts` green.
- Differential test when v6 has the feature, integration test otherwise; coverage thresholds hold.
- Bench gate for changes on the query path.
