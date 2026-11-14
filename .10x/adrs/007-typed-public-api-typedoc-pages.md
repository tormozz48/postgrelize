# ADR-007: Fully typed public API, mandatory TSDoc, TypeDoc site on GitHub Pages

**Status:** Accepted
**Date:** 2026-11-14
**Feature:** postgrelize-mvp
**Author:** 10x-Team (Architect + Staff Engineer + DevOps)

## Context
User requirement (2026-11-14): all external calls fully typed; all exported functions and data structures documented with TSDoc; docs built into a separate website hosted on GitHub Pages.

## Decision
- **Typing:** every export from `src/index.ts` has explicit parameter and return types (oxlint `typescript/explicit-module-boundary-types: error` on `src`); no `any` (`typescript/no-explicit-any: error`). Exception only for v6 type-compat declarations that v6 itself types as `any` — must use `unknown` where v6 compatibility allows.
- **Docs:** TypeDoc (`typedoc.json`, entry `src/index.ts`) with `validation.notDocumented` + `treatWarningsAsErrors` → any undocumented export fails `npm run docs` (exit ≠ 0). Runs in CI `check` job, so PRs cannot merge undocumented API.
- **Site:** `.github/workflows/docs.yml` builds TypeDoc on push to `main` (and manual dispatch) and deploys via `actions/deploy-pages` to `https://tormozz48.github.io/postgrelize/`.

## Alternatives Considered
| Alternative | Pros | Cons | Why Not |
|---|---|---|---|
| VitePress + typedoc-plugin-markdown | Guides + API in one site, vite-based | More config and content | YAGNI now; can wrap TypeDoc output later |
| API Extractor + API Documenter | Strict API report | Heavier, markdown needs separate SSG | More tooling than needed |
| Deploy docs on release tags only | Docs match published version | Docs lag behind main | User asked for site; main is simpler; revisit with versioned docs |

## Consequences
### Positive
- Docs coverage enforced mechanically; site always reflects `main`.
### Negative
- Pins TypeScript to versions TypeDoc supports (6.0.x today), consistent with ADR-006/senior plan.
### Risks
- Repository Pages must be enabled with source "GitHub Actions" (one-time manual setting).

## Dependencies
ADR-005 (standards), ADR-006 (CI).
