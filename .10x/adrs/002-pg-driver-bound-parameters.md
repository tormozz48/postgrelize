# ADR-002: `pg` driver and always-bound parameters

**Status:** Accepted
**Date:** 2026-11-14
**Feature:** postgrelize-mvp
**Author:** 10x-Team (Architect + Staff Engineer)

## Context
v6 uses `pg` and inlines escaped values into SQL text. Drop-in requires v6 connection options (pool, ssl, dialectOptions) to keep working.

## Decision
Use `pg` (peer dependency, `^8`). Compiler always emits `{ text, values }` with `$1..$n` placeholders; values are never inlined. `replacements` in `sequelize.query` are converted to bound params where syntactically possible (v6 compat); `literal()` stays raw by definition. Only `src/connection` imports `pg`.

## Alternatives Considered
| Alternative | Pros | Cons | Why Not |
|---|---|---|---|
| postgres.js | Faster, pipelining | Different config surface | Breaks drop-in of options |
| Inline escaping like v6 | Byte-identical SQL to v6 | Injection surface, no plan cache | Security + perf |

## Consequences
### Positive
- No SQL injection via values; server can cache plans; simpler escaping code.
### Negative
- `logging` SQL differs from v6; untyped `$n` in `fn()` args may need casts.
### Risks
- Type inference errors (`could not determine data type of parameter $1`) → compiler adds casts from DataTypes where type known; covered by tests.

## Dependencies
ADR-001.
