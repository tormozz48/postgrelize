# ADR-025: DDL object APIs: quoted names, guarded fragments, trusted SQL bodies

**Status:** Accepted · **Date:** 2026-11-16 · **Feature:** S11 DDL objects · **Author:** Claude (Architect)

## Context
S11 adds `QueryInterface` methods for extensions, sequences, views, functions, triggers and row-level security policies. Sequelize v6 already has `createFunction`, `dropFunction`, `createTrigger`, `dropTrigger` (and the renames), but its PostgreSQL generator concatenates function names, parameter types, return types, languages, trigger options and trigger argument lists into the statement unquoted. Several inputs (function bodies, view definitions, policy expressions) are SQL by nature and cannot be bound or quoted.

## Decision
- **Same names and argument order as v6** for the methods v6 has; option shapes are kept, so migrations move over unchanged.
- **Names are identifiers**: object, schema, column, role, trigger and table names go through `SqlCompiler.quoteIdent`. Function, parameter and variable names stay unquoted identifier words (`word` or `schema.word`) so they fold to lower case exactly as in v6 and keep working in hand-written SQL and bodies; `{ name, schema }` gives an exact quoted function name.
- **Fragments that cannot be quoted are guarded**: parameter and return types by a strict type-name pattern (identifier words, optional schema, `(n[, m])`, `[]`, optional `SETOF`); language by the identifier-word guard; parameter direction, trigger timing / events, function and trigger option keywords, policy commands and kinds, view check options by fixed allowlists (ADR-020). Anything else throws before SQL is sent.
- **Literals** (trigger arguments, variable defaults, extension version, comments) go through `SqlLiteral` (ADR-010). Trigger arguments are literals; v6 rendered them as typed parameter declarations, which is invalid SQL, so this is a documented v6-bug fix (ADR-016).
- **Trusted SQL**: function bodies, view and materialized-view `query`, and `using` / `withCheck` / `when` string expressions are caller-provided SQL and are not escaped. They are marked "raw by design" on `docs/security.md`: never build them from user input. Dollar quoting for function bodies picks a tag that does not occur in the body, so a body cannot end its own quoting by accident; this is robustness, not a security boundary. Where a where-object is accepted (`using`, `withCheck`) it is compiled like partial-index conditions, with values rendered as literals.
- All new methods are `QueryInterface` methods on new classes; `sync` and models are untouched except the UNLOGGED / TEMPORARY table options.

## Alternatives Considered
| Alternative | Pros | Cons | Why Not |
|---|---|---|---|
| Keep v6 raw strings for names, types, options | Byte-identical SQL | Injection surface in every argument; contradicts golden rule 2 | Not acceptable |
| Allowlist exact types only | Strictest | Rejects user-defined, array and parametrized types | Pattern guard keeps real use cases |
| Escape function bodies | Looks safer | A body is code; escaping cannot make it safe and would break it | Trust boundary documented instead |

## Consequences
+ Migrations written for v6 run with the same call shapes; injection through names and keywords is closed.
− Mixed-case function names behave differently from v6 raw names (quoted, case preserved).
− Callers who need an exotic type or option keyword (e.g. `TABLE(...)` return types) use `sequelize.query`.
