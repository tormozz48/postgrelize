# ADR-010: DDL generation with escaped literals

**Status:** Accepted · **Date:** 2026-11-14 · **Feature:** postgrelize-mvp (M5) · **Author:** 10x-Team (Architect + Security)

## Context
ADR-002 requires bound parameters for all values. PostgreSQL does not accept parameters in DDL (`DEFAULT`, `CHECK`, partial-index `WHERE`, `COMMENT`, `CREATE TYPE ... AS ENUM`).

## Decision
DDL is produced by a separate pure module (`src/ddl/`) that renders values as SQL literals through one `escapeLiteral` function (single quotes doubled; strings containing backslashes use `E'...'` with backslashes doubled; numbers/booleans/null/Date/Buffer/arrays/JSON rendered explicitly). Identifiers always go through `quoteIdent`. Where-conditions inside DDL (partial indexes, `CHECK`) reuse the where compiler and inline the bound values with `escapeLiteral`. DML keeps ADR-002 (bound parameters only).

## Alternatives Considered
| Alternative | Pros | Cons | Why Not |
|---|---|---|---|
| Use `pg` client `escapeLiteral` | Battle-tested | Needs a client instance; pure DDL builders become effectful | Same algorithm is ~10 lines; keep builders pure |
| Forbid expressions in DDL defaults | Smaller surface | Breaks v6 migrations (`defaultValue: 'x'`, `CHECK`) | Not drop-in |

## Consequences
+ v6-compatible DDL. − A second value-rendering path; mitigated by unit tests with hostile strings (quotes, backslashes, `$$`, NUL rejected).

## Dependencies
ADR-002 (DML), ADR-005.
