# Backlog 5 — distribution on npmjs.com

**Date:** 2026-11-17 · **Status:** proposed; needs the owner's decisions below before any publish · **Source:** competitor review (2026-11-17)

## Why

postgrelize is published only to GitHub Packages. Installing it needs a scoped `.npmrc` with a GitHub token (`README.md`, `docs/guide/getting-started.md`), which no competitor requires: `sequelize` (4.1 M downloads a week), `sequelize-typescript`, Drizzle, Prisma, Kysely, TypeORM and MikroORM are all one `npm i` away on npmjs.com. This is the largest adoption barrier. Both `postgrelize` and `@tormozz48/postgrelize` are free on npmjs.com (checked 2026-11-17, E404).

## Owner decisions (blocking)

1. **Package name:** `postgrelize` (unscoped, best discoverability, matches the docs site and the import name used in the docs examples) or `@tormozz48/postgrelize` (current name, no migration for existing users). Recommendation: publish **`postgrelize`**, keep `@tormozz48/postgrelize` on GitHub Packages as a deprecated mirror that points to it for one or two releases. Renaming a published package is costly to reverse, so this becomes an ADR (next free number) once decided.
2. **npm account:** who owns the npm user or organisation, with 2FA enforced; an automation token (or npm trusted publishing via OIDC, preferred) as the `NPM_TOKEN` secret of the repository. Only the owner can create these; the agent never handles the token value.
3. **Keep GitHub Packages?** Dual publish (npmjs primary, GitHub Packages mirror) or npmjs only.

## Stages (after the decisions)

| Stage | Scope | Size |
|---|---|---|
| S18a | ADR on name and registries; `package.json` (`name`, `publishConfig`, `repository`, `homepage`, `bugs`, `keywords`, `funding` if wanted); `release.yml` publishes to npmjs with `--provenance` (needs `id-token: write`), optional second job for GitHub Packages; tag/version check unchanged; dry-run job on PRs (`npm publish --dry-run`, `npm pack` content check, `publint` or `arethetypeswrong` as a one-off check, no new runtime dependency) | S–M |
| S18b | Docs: replace the `.npmrc` instructions with `npm i postgrelize` in README, `docs/guide/getting-started.md`, `docs/llm/**` (then `npm run llm:build`), `llms.txt`, skill, examples; add npm version / downloads badges next to the existing ones; migration note for `@tormozz48/postgrelize` users in `docs/guide/migrating.md` and the CHANGELOG-style release note | S |
| S18c | First npmjs release (minor bump, explicit owner approval per AGENTS.md), `npm deprecate` of the old scoped name with a pointer, verify `npm i postgrelize` in a clean directory and the docs link checks | S |
| S18d | Discoverability: npm keywords and description, a GitHub release page per tag (`gh release create` from `release.yml`), repository topics, comparison page "postgrelize vs Sequelize v6 / v7 / Drizzle / Prisma / Kysely / TypeORM / MikroORM" on the docs site (honest, with a migration table and the numbers from `docs/guide/performance.md`) | M |

## Out of scope

Changing the package contents or API; Sequelize v7 compatibility (v7 is still alpha: `@sequelize/core` 7.0.0-alpha.48, 74 K downloads a week); supporting other databases.

## Gates

Spec/ADR before code; docs and TSDoc rules of AGENTS.md; the release flow of AGENTS.md (branch, PR, tag after merge, read `release.yml`); never publish without the maintainer's explicit approval; never print or commit tokens.
