# ADR-036: Inline `replacements` of `sequelize.query` as escaped literals

**Status:** Accepted (narrow exception to ADR-002; ADR-010 escaper reused)
**Date:** 2026-11-23
**Feature:** v6 gap H
**Author:** 10x-Team (Architect + Security Engineer)

## Context
Sequelize v6 `formatNamedParameters` writes `replacements` into the SQL text as escaped literals and sends the result as one simple-protocol query, so one `sequelize.query` call can run several `;`-separated statements with replacements. ADR-002 turned `replacements` into `$n` parameters. PostgreSQL rejects several commands in one prepared (extended-protocol) statement (`cannot insert multiple commands into a prepared statement`), so migrations and scripts that worked on v6 fail on postgrelize 1.4.0. The owner asked for the v6 behaviour.

## Decision
- `sequelize.query` writes `replacements` (`:name` and `?`) into the SQL text through the shared `SqlLiteral.escape` (ADR-010): strings are quoted with `'` doubled and `E'...'` with doubled backslashes when they contain one, numbers and booleans are written as is, `null` is `NULL`, dates are ISO strings, objects are JSON text, arrays inside `IN (:ids)` expand to a comma list, expressions (`literal`, `col`, ...) are rendered as before.
- A query without `bind` then carries no parameters and goes to PostgreSQL as a simple query: several statements run.
- `bind` (`$1`, `$name`) stays bound.
- Not changed: the replacements of the finders (`findAll`, `count`, `update`, ... for placeholders inside `literal()`) stay bound parameters, and so does every model, DML and QueryInterface builder. ADR-002 holds for all of them.
- Placeholders are found by the existing scanner, which skips string literals, quoted identifiers, comments, dollar quotes, `::` casts and `?|` / `?&`. Escaped values are inserted in one pass and are never scanned again, so a value that looks like a placeholder is not substituted.
- Divergence from v6 (ADR-016): a string with a NUL character throws; v6 writes the two characters `\0`, which silently changes the value (PostgreSQL cannot store NUL in text).
- Security coverage: a row on `docs/security.md` (status changes from Bound to Escaped), payload and `fast-check` tests in `tests/integration/security/raw-replacements.test.ts`, a differential test in `tests/compat`.

## Alternatives Considered
| Alternative | Pros | Cons | Why Not |
|---|---|---|---|
| Keep `$n` parameters (ADR-002) | No escaping surface | Multi-statement queries fail, breaks v6 scripts | Does not meet the requirement |
| Keep `$n`, split the text into statements and run each | Values stay bound | Needs a SQL tokenizer for `;` (dollar quotes, `CREATE FUNCTION` bodies, `BEGIN ATOMIC`), several round trips, results of only the last statement, parameters shared across statements | Fragile and not v6 behaviour |
| Inline only when the text has several statements | Bound in the common case | Two behaviours, detection needs the same tokenizer, plan and typing differ by accident | Surprising |
| New option `inlineReplacements` | Opt-in | Default stays incompatible with v6 | Drop-in is the contract |

## Consequences
### Positive
- Multi-statement raw queries with replacements run, as in v6; the logged SQL shows the values, as in v6.
- One escaper (`SqlLiteral`) for DDL and raw replacements, tested by the injection suite.
### Negative
- An injection surface returns on this one path: user-supplied `replacements` depend on the escaper being correct for `standard_conforming_strings` on (the PostgreSQL default; `E'...'` is used for backslashes so the setting does not matter for them). No plan cache for these queries.
### Risks
- An escaper bug would be an injection: covered by payload and property tests running on PostgreSQL 16/17/18, where a `42601` syntax error means a payload escaped.

## Dependencies
ADR-002, ADR-010, ADR-016, ADR-020.
