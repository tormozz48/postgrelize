# ADR-029: File size limit of 400 lines

**Status:** Accepted (supersedes the file-size part of ADR-021; ADR-021 keeps the function limit, decorators and mixins)
**Date:** 2026-11-21
**Feature:** code style
**Author:** 10x-Team (Staff Engineer), at the owner's request

## Context
ADR-021 set oxlint `max-lines: 150` (code lines, without comments and blank lines) and `max-lines-per-function: 20` on `src/**`. S6 brought every file under both limits. In practice the 150-line file limit forces splits of cohesive classes into many tiny files, which scatters one responsibility across modules, adds imports and mixin plumbing, and makes additive work such as the v6 API surface parity (static aliases, `queryInterface` methods) cost more than it should. The owner asked to allow files of 300-400 lines.

## Decision
- `max-lines` on `src/**` is **400** code lines (comments and blank lines still skipped). Aim for 300: a file that holds several responsibilities is split regardless of its length; the limit is a ceiling.
- `max-lines-per-function` stays **20**. The other rules of ADR-021 (decorators, mixins, no exemption list, never add an override that turns a size rule off) stay.
- `tests/unit/build/size-ratchet.test.ts` keeps pinning the exemption lists at zero.

## Alternatives Considered
| Alternative | Pros | Cons | Why Not |
|---|---|---|---|
| Keep 150 | Smallest units, nothing to change | Fragmentation of cohesive classes, more indirection | The owner asked to relax it |
| 300 | Closer to the old intent | Still splits some classes that are one responsibility | 400 as ceiling with 300 as the target gives room without inviting growth |
| No file limit, function limit only | Simplest | Nothing stops god classes | A ceiling keeps review pressure |

## Consequences
### Positive
- Cohesive classes (for example the `Sequelize` facade with its v6 aliases) can stay in one file.
- Fewer files and imports for new work.
### Negative
- Larger files are harder to skim; reviewers must still reject files with mixed responsibilities.
### Risks
- Drift towards 400 as the norm. Mitigation: AGENTS.md says to aim for 300, and function size stays at 20.

## Dependencies
ADR-021 (size limits, decorators, mixins), ADR-018 (classes with one responsibility).
