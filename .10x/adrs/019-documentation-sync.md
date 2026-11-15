# ADR-019: Contributor guide and documentation sync rules

**Status:** Accepted
**Date:** 2026-11-15
**Feature:** handover
**Author:** 10x-Team (Staff Engineer + EM)

## Context
The package must be maintainable by another person or agent. The rules are spread across 18 ADRs, specs and role notes, and some are stale (ADR-005's functional style, the Effect core). Documentation lives in four places: TSDoc → TypeDoc API, `docs/examples` → guide code blocks, the guide/README/issues pages, and `.10x`. Only the first two are checked by tools.

## Decision
- `AGENTS.md` at the repo root is the single entry point for contributors: golden rules, commands, architecture and style rules, testing rules, documentation sync, decision-record rules, ADR index, git/release flow. `CLAUDE.md` imports it so Claude Code loads it automatically.
- Documentation sync is a change → artifact table in `AGENTS.md`. It is enforced by:
  - tools where possible: TypeDoc `notDocumented` for the API, the `docs` test project for the examples;
  - a PR template checklist for the rest.
- New guide code comes from executed `docs/examples` regions; no new untested inline code blocks.
- A rule change updates `AGENTS.md` in the same PR. Superseded ADRs get their status line updated.

## Alternatives Considered
| Alternative | Pros | Cons | Why Not |
|-------------|------|------|---------|
| `CONTRIBUTING.md` only | Familiar to humans | Not picked up by coding agents | Agents are expected contributors; `AGENTS.md` serves both |
| CI script that checks docs changed with `src` | Automatic | Many false positives (refactors, internal changes) | Noise would train people to bypass it; revisit if the checklist proves insufficient |
| Leave rules in `.10x` | No new file | Scattered, partly stale | Hard to hand over |

## Consequences
### Positive
- One file to read before contributing; stale rules are marked as superseded.
### Negative
- The guide, README and issues page still depend on review discipline.
### Risks
- `AGENTS.md` drifts from reality. Mitigation: rule changes must update it in the same PR, and reviewers check the template item.

## Dependencies
ADR-004, ADR-007, ADR-016, ADR-018.
