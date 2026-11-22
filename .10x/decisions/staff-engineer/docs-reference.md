# Docs reference rework

**Date:** 2026-11-22 · **PR:** [#127](https://github.com/tormozz48/postgrelize/pull/127) (merged, merge commit `3e40a1b`) · **Spec:** `.10x/specs/2026-11-22-docs-reference-design.md` · **ADR:** 035

## Delivery
- Merged to `main` with a merge commit after 11/11 green checks on `f415cec`; CI, Docs and CodeQL green on `main`; site deployed (`/reference/`, `/extensions/`, `/reference/options/*`, `/guide/errors`, `/guide/connection` return 200).
- **Not released.** No version bump, tag or npm publish; the change is under `[Unreleased]` in `CHANGELOG.md` and ships with the next release.

## What was built
- Reference hub `docs/reference/index.md`: index by entity and by task.
- Generated (git-ignored, `npm run docs:options`): option reference `docs/reference/options/{queries,writes,models,connection,schema}.md` (one table per option type, TSDoc description, `@defaultValue`, type-level `@see` / `@example`) and `docs/extensions/index.md`.
- Extensions marked in code with the TSDoc modifier tag `@postgrelize` (`tsdoc.json`); the badge in option tables, the Extensions page lists and the API reference badge come from it.
- Guide: new `errors` and `connection` pages with executed examples (`docs/examples/errors.ts`, `connection.ts`); `<Ext />` badge on every extension section; sidebar regrouped. No URL changed.
- Tests: `tests/docs/option-reference.test.ts` (descriptions, unlisted types, untagged options / members missing from v6 typings vs `V6_RUNTIME_OPTIONS` / `V6_RUNTIME_MEMBERS`), `doc-links.test.ts` (dead anchors), `feature-examples.test.ts` (badge on beyond-v6 sections).

## Deviations
- Generator reads declarations through the TypeScript checker, not the TypeDoc JSON model: option bags are intersections that TypeDoc keeps unresolved. The TSDoc source is the same.
- Branch was updated with a merge of `main` (force-push not permitted), not a rebase.

## Test results
- Local before merge: lint, format, typecheck, `npm test` (158 files, 1147 passed, 2 skipped, PostgreSQL 18), `npm run docs`, `build` + `test:build` green.

## Follow-ups
- Data types still live inside the models page.
- Association mixin option types are not in the option reference.
- More scenarios per option in TSDoc `@example`s.
- `references: { model: ModelClass }` failed with `name.replaceAll is not a function` while writing the errors example; not checked against v6.
