# Backlog 3 roadmap — SQL-injection assurance, PostgreSQL coverage

**Date:** 2026-11-15 · **Status:** approved by owner · **Language of public docs:** English

Owner goals:

1. Be sure the package withstands SQL injection.
2. Be sure the package supports PostgreSQL's capabilities.

Delivered as separate stages, each with its own branch, PR, and ADR where a decision is architectural. This document fixes scope, decisions and order.

## Decisions taken in brainstorming

| Topic | Decision |
| --- | --- |
| Injection assurance level | Audit of every input surface + payload and property-based tests on real PostgreSQL + CodeQL in CI. No sqlmap/demo app. |
| "All PostgreSQL features" | An explicit coverage matrix of PostgreSQL 16–18 features an ORM can reasonably expose. Each row: supported (with a test), via `literal`, or out of scope (with a reason). Gaps closed in later stages, in priority order. |
| Order | S5 security → S6 matrix → S7+ gap stages |
| New dev dependency | `fast-check` (property-based tests). No new runtime dependencies. |

## S5 — SQL-injection assurance

**Inventory.** Every public input that can reach SQL text, with one protection mechanism each:

| Mechanism | Meaning |
| --- | --- |
| bound | Sent as a `$n` parameter (ADR-002) |
| identifier | Quoted by the shared identifier quoting (`"` doubled); the value can only ever name an object |
| allowlist | Validated against a fixed set (order directions, operators, cast types, function names, isolation levels, …); anything else throws before SQL is built |
| literal | Rendered by `SqlLiteral` (ADR-010), only in DDL and COPY TO |
| raw by design | Caller-supplied SQL (`literal()`, raw `sequelize.query` text, string `where`). Not protected; documented with a TSDoc warning. |

Surfaces to cover (at least):
- **Model API values:** where values, including nested JSON, `Op.*`, arrays, ranges.
- **Names:** attribute and column names, `as` aliases, table and schema names, `searchPath`.
- **Query clauses:** `order`, `group`, `having`, `attributes` with `fn`/`col`/`cast`/`json`, JSON path segments.
- **Raw queries:** `replacements` (named and positional) and `bind`.
- **Writes:** `onConflict` targets and `where`, MERGE sources, CTE names and bodies, `returning` / `returningOld`.
- **DDL:** defaults, comments, CHECK, partial-index `where`, enum values.
- **Bulk and session:** COPY FROM data and COPY TO options, LISTEN/NOTIFY channels and payloads, advisory-lock keys, transaction `SET` settings, QueryInterface methods.

**Tests** in `tests/integration/security/`, on real PostgreSQL:
- **Payload corpus**, applied to each surface:
  - quote breaking (`' OR 1=1 --`, `'); DROP TABLE canary; --`, `"; DROP …`);
  - backslash / `E''` tricks;
  - dollar quoting (`$$`, `$tag$`);
  - `U&` escapes;
  - comments (`--`, `/* */`);
  - statement separators;
  - NUL bytes, Unicode and very long strings.
- **Properties** (`fast-check`, fixed seed, bounded runs):
  - any string used as a value reads back byte-for-byte;
  - any string used as an identifier is either rejected or creates/uses an object with exactly that name;
  - a canary table and its row count stay intact.
- **SQL-shape assertions:** for bound surfaces, the payload never appears in the generated SQL text, only in values.

**Static analysis:** `.github/workflows/codeql.yml` (JavaScript/TypeScript, `security-extended`) on PRs, `main` and weekly. Alerts are triaged: fixed, or dismissed with a written reason.

**Docs:**
- a "Security" page on the site: the inventory table, the raw-by-design APIs and safe alternatives;
- a `SECURITY.md` with a reporting policy (GitHub private vulnerability reporting);
- a TSDoc warning on every raw-by-design API.

**Done when:**
- every surface in the inventory has at least one payload test, and bound/identifier surfaces have property tests;
- CodeQL is green with zero open alerts;
- any finding is fixed with a regression test;
- the review is written to `.10x/reviews/<date>-injection-review.md`;
- ADR-020 records the assurance policy, including the rule "a new input surface is not merged without an inventory row and tests";
- `AGENTS.md` is updated.

## S6 — PostgreSQL coverage matrix

- **Scope:** PostgreSQL 16–18 features an ORM can reasonably expose:
  - SELECT clauses, DML (INSERT/UPDATE/DELETE/MERGE/RETURNING), operators;
  - data types and their functions (JSON/JSONB, arrays, ranges/multiranges, full-text search, network, geometric, UUID, intervals, …);
  - DDL that `sync`/QueryInterface covers (tables, constraints, indexes, generated/identity columns, enums, comments, partitioning, views);
  - session features (transactions, isolation, locks, LISTEN/NOTIFY, COPY, prepared statements, replicas).
- **Out of scope by definition:** server administration (roles, replication setup, tablespaces, vacuum), procedural languages, extension internals. Each is listed with its reason.
- **Source of truth:** a typed data file, `docs/coverage/postgresql-features.ts`. Each row has:
  - `area`, `feature`, `minPg`;
  - `status`: `supported` | `literal` | `planned` | `out-of-scope`;
  - a `test` reference (file + test name) for supported rows;
  - a `note`.
  - It refreshes and replaces the 2026-11-14 gap analysis.
- **Drift check:** a `docs` test asserts that every `supported` row references an existing test (file exists and contains the test name).
- **Site page:** "PostgreSQL coverage" is rendered from the data file at docs build time.
- **Done when:** the matrix covers all areas above, every supported row is test-backed, and the page is published. The `planned` rows are grouped into proposed S7+ stages for owner approval.

## S7+ — Closing gaps

- One stage per coherent group of `planned` rows (e.g. full-text search, range functions, partitioning DDL), in the priority order approved by the owner after S6.
- Each stage:
  - a spec;
  - an ADR when an API shape is new;
  - tests: differential where v6 has the feature, otherwise integration;
  - docs: a guide page plus examples;
  - matrix rows switch to `supported`.

## Risks

- **False confidence:** tests prove only the surfaces in the inventory. Mitigations: the inventory is derived from the public API (`src/index.ts` exports and option types), not from memory; ADR-020 makes the inventory a merge requirement.
- **CodeQL on a library:** CodeQL has few sinks for a library that builds SQL strings itself, so it is a supplement to the tests, not the main control.
- **Matrix size:** keep rows at the granularity of user-visible capabilities, not individual functions. Functions callable through `fn()` count as supported by `fn` and are tested by a representative.
