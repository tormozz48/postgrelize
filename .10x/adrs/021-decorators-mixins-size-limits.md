# ADR-021: TC39 decorators, mixins and size limits

**Status:** Accepted (refines ADR-018: classes stay the unit of behaviour; adds decorators, mixins and enforced size limits); the file-size limit (150 lines) is superseded by ADR-029 (400 lines), the function limit and the rest stay
**Date:** 2026-11-15
**Feature:** backlog-3 S6
**Author:** 10x-Team (Architect + Staff Engineer)

## Context
The owner requires smaller units (functions ≤ 20 lines, classes ≤ 150 lines) and the use of decorators and mixins, both internally and as an optional public model API. Under ADR-018 the code base has 30 files and 110 functions above these limits, and `Model` alone has 813 code lines. The toolchain (Vite 8/Vitest on oxc, Node 24) does not lower TC39 decorators.

## Decision
- **Decorators** are TC39 standard decorators. A Vite plugin lowers them with `typescript.transpileModule`, only in files that contain decorators. It is used by the library build and by every test project. `dist` contains no decorators.
- **Public decorators** accept both the TC39 and the legacy (`experimentalDecorators`) call signatures.
- **Internal decorators** are used only for cross-cutting concerns that are otherwise repeated (hooks around operations, transaction scope, logging, memoization), and never on hot paths that fail the bench gate.
- **Mixins** compose classes that have many independent capabilities, primarily `Model`. The generic `Model<TAttributes, TCreationAttributes>` is the final class that extends the mixin chain.
- **Size limits:** oxlint `max-lines: 150` and `max-lines-per-function: 20` on `src/**`, both counting code lines only. Existing violators sit in a shrinking override list (a ratchet).
- **Benchmarks** run through Vitest, because Node cannot strip decorators.

## Alternatives Considered
| Alternative | Pros | Cons | Why Not |
|-------------|------|------|---------|
| Legacy `experimentalDecorators` everywhere | Supported by oxc out of the box; NestJS ecosystem | Non-standard and frozen; different semantics from what runtimes will ship | Standard decorators are the future; the public API still supports legacy callers |
| esbuild or Babel for decorators | Fast (esbuild), mature | New dev dependency | TypeScript is already installed and sufficient |
| Composition only (capability objects, no mixins) | Simplest typing | Owner asked for mixins; `Model`'s static surface still needs a home | Kept as the fallback if mixin typing degrades `.d.ts` |
| Limits as a guideline only | No churn | Drifts | Owner chose lint enforcement |

## Consequences
### Positive
- Small, single-purpose units.
- Cross-cutting concerns live in one place.
- An optional decorator model API for users.
### Negative
- A build plugin for decorators.
- Mixin typing is more complex.
- A large refactor spread over several PRs.
### Risks
- `.d.ts` and TypeDoc readability with mixins. Mitigation: named mixin factories, plus checks on `tests/types` and the docs build.
- Performance. Mitigation: the bench gate on every PR.

## Dependencies
ADR-018 (classes), ADR-007/019 (docs), ADR-004 (differential tests).
