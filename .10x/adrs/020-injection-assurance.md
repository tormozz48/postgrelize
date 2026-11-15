# ADR-020: SQL-injection assurance policy

**Status:** Accepted
**Date:** 2026-11-15
**Feature:** backlog-3 S5
**Author:** 10x-Team (Security Engineer + Staff Engineer)

## Context
ADR-002 (bound parameters) and ADR-010 (escaped DDL literals) define how values reach SQL, but nothing checked that *every* input follows them. The S5 audit found five unprotected paths: raw `lock` strengths, the `Model.aggregate` function name, `isolationLevel`, `Deferrable`/DataTypes parameters, and the `timezone` startup option. It also found a weak comparator allowlist and `$n` placeholder matching inside identifiers. Raw strings in the AST that bypass quoting are the recurring cause. Stacked statements execute because statements without values use the simple query protocol.

## Decision
- Every public input that reaches SQL text has exactly one protection: bound, identifier, allowlist, literal, or raw by design. The inventory lives on the public Security page (`docs/security.md`).
- **Merge rule:** a new option or method whose input reaches SQL needs (1) an inventory row, (2) a payload test in `tests/integration/security/`, and (3) a property test when it is bound or an identifier. Unknown enum-like strings are rejected; where Sequelize v6 silently maps unknown values (lock strengths → `FOR UPDATE`), postgrelize keeps v6 behaviour.
- AST nodes keep free-form strings only for values already validated at the builder boundary. The compiler interpolates strings only for quoted identifiers or allowlisted keywords.
- Raw-by-design APIs (`literal`, `sequelize.query` text, string `where`/`order`) carry a TSDoc warning.
- Tests run on real PostgreSQL with a canary table, a fixed `fast-check` seed (`PGZ_FC_SEED`/`PGZ_FC_RUNS` override), and a syntax-error check (`42601`) as the signal that a payload escaped its quoting.
- CodeQL `security-extended` runs on PRs, `main` and weekly; alerts are fixed or dismissed with a written reason.

## Alternatives Considered
| Alternative | Pros | Cons | Why Not |
|-------------|------|------|---------|
| Extended query protocol for every statement (always send `values`) | Blocks stacked statements globally | Breaks multi-statement raw queries users run on purpose (v6 allows them); DDL needs the simple protocol | Treats the symptom; the real defect is unvalidated strings |
| sqlmap against a demo app | Recognisable external check | Extra infrastructure; only tests the demo's surfaces | Owner chose audit + fuzz + SAST |
| Rely on CodeQL only | Zero maintenance | Few sinks for a library that builds SQL itself | Not sufficient on its own |

## Consequences
### Positive
- Every SQL input surface is listed, tested and documented; regressions fail CI.
### Negative
- New features carry extra test and docs work.
### Risks
- An input path missed by the inventory. Mitigation: the inventory comes from the public API and option types; reviewers check the merge rule (AGENTS.md, PR template).

## Dependencies
ADR-002, ADR-010, ADR-016 (v6 injection bugs fixed by default), ADR-019.
