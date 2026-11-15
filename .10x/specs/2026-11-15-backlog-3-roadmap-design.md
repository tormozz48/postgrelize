# Backlog 3 roadmap — SQL-injection assurance, PostgreSQL coverage

**Date:** 2026-11-15 · **Status:** approved by owner · **Language of public docs:** English

Owner goals:

1. Be sure the package withstands SQL injection.
2. Be sure the package supports PostgreSQL's capabilities.
3. (added 2026-11-15) Smaller classes and functions; use decorators and mixins, internally and as an optional public model API.
4. (added 2026-11-15) Test coverage at ~98%.
5. (added 2026-11-15) Make it easy for LLMs to understand and use the package from other programs.

Delivered as separate stages, each with its own branch, PR, and ADR where a decision is architectural. This document fixes scope, decisions and order.

## Decisions taken in brainstorming

| Topic | Decision |
| --- | --- |
| Injection assurance level | Audit of every input surface + payload and property-based tests on real PostgreSQL + CodeQL in CI. No sqlmap/demo app. |
| "All PostgreSQL features" | An explicit coverage matrix of PostgreSQL 16–18 features an ORM can reasonably expose. Each row: supported (with a test), via `literal`, or out of scope (with a reason). Gaps closed in later stages, in priority order. |
| Order | S5 security → S6 refactor (decorators, mixins, size limits) → S7 coverage ~98% (done: 99.7%) → S7b parity and robustness → S8 API/LLM docs → S9 PostgreSQL matrix → S10 performance → S11+ gap stages |
| Decorators | Internal (cross-cutting concerns) and an optional public decorator API for models next to `init`/`define` |
| Size limits | Functions ≤ 20 lines, classes (files) ≤ 150 lines, enforced by oxlint |
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

## S6 — Refactor: small units, decorators, mixins

- Functions ≤ 20 lines and class files ≤ 150 lines, enforced by oxlint `max-lines-per-function` / `max-lines` (tests and generated code excluded).
- Decorators (TC39 standard decorators, not `experimentalDecorators`) for cross-cutting concerns inside `src` (hook pipelines, validation, logging, transaction scoping); mixins for capabilities shared by classes (e.g. scoping, hooks, association accessors) instead of deep inheritance or god classes.
- Public, optional decorator API for models (`@Table`, `@Column`, association decorators, hook decorators) that produces exactly what `Model.init` / associations produce; v6 API unchanged.
- Constraint: Node's `--experimental-strip-types` cannot run decorators, so `bench/` moves to a runner that compiles TypeScript (Vite/Vitest), and the docs and AGENTS.md drop that command.
- Gates: all suites unchanged and green; `bench/compare.ts` ≤ +10%; ADR superseding the "classes without decorators" parts of ADR-018.

## S7 — Test coverage ~98%

- Target: ≥ 98% lines, statements and functions, measured on the post-S6 code; branches reported and raised where meaningful.
- Enforced by `coverage.thresholds` in `vitest.config.ts`, so CI fails below the target.
- New tests follow AGENTS.md placement rules (unit / compat / integration); no tests that only touch lines without asserting behaviour.

## S8 — API documentation and LLM-facing documentation

Requirement (owner, 2026-11-15): all public classes, functions, class fields, types, interfaces and variables are documented in code for the API section, written for both people and LLMs, with usage examples wherever possible, and kept current with code changes (rules in AGENTS.md → API documentation, PR template).

- TSDoc pass over the whole public surface (after S6, so it documents the final structure): summary, behaviour notes, `@param`/`@returns`/`@throws`/`@defaultValue`/`@see`, `@example` for every non-trivial item.
- Enforcement: TypeDoc `requiredToBeDocumented` extended to properties, accessors, type aliases, interfaces, enum members and variables; a docs test that fails when a public function, method or class has no `@example` (allowlist for trivial items), and type-checks the examples.

Proposed (detailed spec at stage start, owner approval):
- `llms.txt` and `llms-full.txt` on the docs site, generated from the VitePress pages and API reference.
- A compact usage guide shipped inside the npm package next to the typed `.d.ts` files, so agents can read it from `node_modules`.
- An Agent Skill (`SKILL.md`): usage patterns, v6 differences, PostgreSQL features and common mistakes, with examples checked by tests like `docs/examples`.
- No MCP server: no runtime value for a library.

## S9 — PostgreSQL coverage matrix

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
- **Done when:** the matrix covers all areas above, every supported row is test-backed, and the page is published. The `planned` rows are grouped into proposed S11+ stages for owner approval.
- **Result (2026-11-15):** 133 rows: 69 supported, 13 literal, 39 planned, 12 out-of-scope. Review with the proposed S11–S17 gap stages: `.10x/reviews/2026-11-15-pg-coverage-matrix.md`.

## S10 — Performance (added 2026-11-15)

Owner request: a separate stage to raise the library's performance. Detailed spec at stage start: profile the hot paths (query building, compilation, row mapping, instance construction, hooks) with the stub and real-database benchmarks, compare with Sequelize v6 on the same scenarios, add cases for associations/includes and large result sets, set targets per case, then optimise (caching compiled statements, prepared statements, cheaper instance construction, fewer allocations). The bench baseline is updated only after the stage. Known input: the ungated `transaction + update` case is ~6% slower after S6b-2 (finer-grained async steps and the hook decorator on the update path).

## S11+ — Closing gaps

- One stage per coherent group of `planned` rows (e.g. full-text search, range functions, partitioning DDL), in the priority order approved by the owner after S9.
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
