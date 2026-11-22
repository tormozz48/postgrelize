# ADR-035: Generated option reference and extension marking in the docs

**Status:** Accepted
**Date:** 2026-11-22
**Feature:** documentation
**Author:** 10x-Team (Staff Engineer), at the maintainer's request

## Context
The guide mirrored the Sequelize docs structure. Extensions (options, methods, types that Sequelize v6 lacks) were mixed into the general pages, options were described only in prose or in generated TypeDoc pages where option bags such as `FindOptions` show as one unreadable intersection type, and there was no quick index by task. Hand-written option tables would drift from the code.

## Decision
1. **Option reference is generated**, not written. `scripts/generate-option-reference.ts` reads the TypeScript declarations and TSDoc of the option types listed in `scripts/option-groups.ts` and writes `docs/reference/options/*.md` (git-ignored, like `docs/api`) as part of `npm run docs`. Every property is listed with type, default (`@defaultValue`) and description.
2. **Extension status is a TSDoc tag.** `@postgrelize` (modifier tag, registered in `tsdoc.json`, which extends `typedoc/tsdoc.json`) marks every option, option type, class member, function and constant that Sequelize v6 lacks. The generator compares with the `sequelize@6` typings and fails when an option or a `Model` / `Sequelize` / `Transaction` / `QueryInterface` member is missing there but neither tagged nor allowlisted (`V6_RUNTIME_OPTIONS`, `V6_RUNTIME_MEMBERS`: what v6 accepts at runtime without typing it). New API therefore forces a decision. TSDoc stays the single source of descriptions, defaults and examples; nothing is duplicated in markdown.
3. **Pages mark extensions with the `<Ext />` badge** (global Vue component). Every guide section linked from a `beyondV6` matrix row or `EXTRA_FEATURES` must contain it (`tests/docs/feature-examples.test.ts`).
4. **The Extensions page is generated** (`docs/extensions/index.md`) from the matrix, `EXTRA_FEATURES` and the `@postgrelize` tags (options, methods, helper exports). The generator also turns TypeDoc's rendering of the tag in `docs/api` into the same `<Ext />` badge.
5. **Navigation:** the sidebar is grouped into "Find anything", "Sequelize v6 API", "postgrelize extensions", "Option reference" and "More"; a hand-written Reference hub gives an index by entity and by task. No page moves, so no URL changes and no redirects are needed.

## Alternatives Considered
| Alternative | Pros | Cons | Why Not |
|---|---|---|---|
| Hand-written option tables per method | Best prose | Drift; hundreds of rows | Fails requirement that tables cannot drift |
| Text convention ("PostgreSQL extension." in the comment) | No tag registration | Free text is ambiguous ("With `onConflict` (PostgreSQL extension)" on `create`, a v6 method) | The maintainer asked for a machine-readable marker in the code |
| Read the TypeDoc JSON model instead of the TS checker | One model for API pages and tables | Intersections, `Omit` and `Readonly` of option bags stay unresolved in TypeDoc | Same TSDoc either way; the checker gives the resolved property list |
| Mark extensions only by diff with the `sequelize@6` typings | No TSDoc edits | v6 accepts many options at runtime that its typings omit (`rejectOnEmpty`, `retry`, ...), so badges would be wrong | Wrong claims are worse than none |
| Move extension pages under `/extensions/` | Separate URL space | Breaks URLs, needs redirects on GitHub Pages | Sidebar grouping and badges give the separation without moving pages |

## Consequences
### Positive
- Option documentation cannot drift or be forgotten; CI fails first.
- Users see at a glance what is v6 and what is new.
### Negative
- The option pages exist only after `npm run docs` (or `npm run docs:options`).
- `V6_RUNTIME_OPTIONS` and `V6_RUNTIME_MEMBERS` are hand-kept allowlists.
### Risks
- A new extension without the tag would pass if its name is allowlisted by mistake, or if it is a type v6 does not have under the same name. Reviewers check the allowlist in diffs.

## Dependencies
ADR-007 (TSDoc and TypeDoc), ADR-019 (documentation sync), ADR-032 (v6 type parity).
