# ADR-005: Functional core, thin class shell; SOLID + YAGNI

**Status:** Superseded by ADR-018 (2026-11-15)
**Date:** 2026-11-14
**Feature:** postgrelize-mvp
**Author:** 10x-Team (Architect + Staff Engineer)

## Context
User requirement: library code must be maximally clean, prioritise SOLID and YAGNI, written in functional style. Constraint: Sequelize v6 public API is class-based (`class User extends Model`, `Model.init`, instance methods, `new Sequelize()`), and drop-in requires keeping it.

## Decision
- **Functional core:** all logic is pure functions over immutable, plain data (`readonly` types): option normalization, scope merging, where → AST, AST → SQL compiler, row → attribute mapping, error mapping, validation, hook ordering. No classes, no `this`, no mutation of inputs inside the core.
- **Effects at the edge:** I/O only in `src/connection` (pool, query) and `src/transaction` (client lifecycle, AsyncLocalStorage). Core functions receive dependencies as parameters (dependency inversion), never import the executor.
- **Thin class shell:** `Sequelize`, `Model`, `Transaction` exist only because the v6 API requires them. Their methods are 1–5 line delegations to core functions. Model instance state (`dataValues`, `_previousDataValues`, `isNewRecord`) is the only mutable state, required by v6 semantics (`instance.set`, `save`).
- **No inheritance** inside the library except the user-facing `Model` base and error classes (v6 `instanceof` compat). No internal class hierarchies, no abstract dialect layer.
- **SOLID mapping:** S — one module = one responsibility, one exported purpose; O — new SQL features = new AST node + compiler case, not edits to unrelated code; L — error subclasses substitutable as in v6; I — small per-module type interfaces (e.g. `Executor = (q: CompiledQuery) => Promise<Rows>`); D — core depends on function types, not on `pg`.
- **YAGNI:** implement only what a milestone's tests demand; no speculative options, plugin systems, or dialect abstractions.

## Alternatives Considered
| Alternative | Pros | Cons | Why Not |
|---|---|---|---|
| Classic OOP like Sequelize (QueryGenerator classes, dialect inheritance) | Mirrors v6 internals | Large hierarchies, hidden state, hard to test | Contradicts user requirement |
| Fully functional public API (no classes) | Purest | Not drop-in | Breaks ADR-001 |

## Consequences
### Positive
- Core testable without DB or mocks; small modules; easy to reason about.
### Negative
- Shell ↔ core adapters add a thin layer; instance mutability is an accepted exception.
### Risks
- Drift into fat classes over time → lint rule review + code review checklist in staff-engineer standards.

## Dependencies
ADR-001.
