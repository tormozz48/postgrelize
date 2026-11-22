# Docs reference rework: information architecture

**Date:** 2026-11-22 · **ADR:** [035](../adrs/035-docs-reference-and-extension-marking.md)

## Goal
A reader finds the description and usage of any feature fast and sees what is a postgrelize extension over Sequelize v6.

## Audit (before)
- 17 guide pages mirroring Sequelize's structure; extensions were mixed into `models`, `querying`, `schema` and `transactions`, and separate only for the "PostgreSQL features" group.
- Entities without their own page: errors (one paragraph in getting started), connection / pool / logging (a paragraph plus pieces in sessions), data types (one section of models).
- Options: documented in prose where the author remembered; TypeDoc shows `FindOptions` and 40 other option bags as intersection types without per-option rows. 1700 option properties across 132 `*Options` types; all had TSDoc except `HooksOption` members.
- No index by task; the matrix page lists PostgreSQL features, not API entry points.
- No visual marker of extensions in guide text, no check that an extension section is marked.

## Information architecture
Sidebar groups: Introduction, **Find anything** (Reference hub, Extensions, Option reference, PostgreSQL coverage), **Sequelize v6 API** (models, associations, querying, transactions, hooks, errors, connection, schema), **postgrelize extensions** (overview, decorators, upserts, bulk writes, advanced queries, sessions, schema objects, constraints), **Option reference** (5 generated pages), More.

| Page | Kind |
|---|---|
| `/reference/` | hand-written: by entity and by task tables |
| `/extensions/` | generated: features per area, methods, options, helper exports |
| `/reference/options/{queries,writes,models,connection,schema}` | generated from types and TSDoc |
| `/guide/errors`, `/guide/connection` | new, with examples run by the docs project |
| existing guide pages | kept at their URLs; `<Ext />` on extension sections; extension intro callout |

## Checks (CI)
- `tests/docs/option-reference.test.ts`: every listed option type exists; every option has a description; every `*Options` export is on a page; every option missing in `sequelize@6` typings is marked or allowlisted.
- `tests/docs/feature-examples.test.ts`: every beyond-v6 guide section has `<Ext />`.
- `tests/docs/extension-members.test.ts`: curated methods exist; guide anchors exist.
- `tests/docs/doc-links.test.ts`: no dead `#anchor` between hand-written pages or into the option reference.

## Not done / remaining
- Guide pages are not split further by entity (data types still live in `models`).
- Association mixin option types (`HasManyAddAssociationMixinOptions`, ...) are not in the option reference.
- Per-method option tables beyond the generated type tables (a method page listing the options of each overload) are not generated; the type pages link by name.
- Most prose pages still show one or two examples per feature; additional scenarios per option are a follow-up.
