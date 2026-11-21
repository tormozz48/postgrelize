# ADR-028: Publish `postgrelize` on npmjs.com

**Status:** Accepted · **Date:** 2026-11-21 · **Feature:** S18a distribution · **Author:** Claude (DevOps) · Supersedes the publishing parts of ADR-006

## Context
Until 0.12.0 the package was published only to GitHub Packages as `@tormozz48/postgrelize` (ADR-006). Installing it needs a scoped `.npmrc` with a GitHub token, which no competing ORM requires. This is the largest adoption barrier (`.10x/specs/2026-11-17-backlog-5-roadmap-design.md`). Both `postgrelize` and `@tormozz48/postgrelize` were free on npmjs.com when checked. The owner chose the unscoped name `postgrelize`, which also matches the docs site and the import name used in every example.

## Decision
- **Name and registry:** the package is `postgrelize` on https://registry.npmjs.org/ (`publishConfig`: `access: public`, npmjs registry). `release.yml` publishes it with `npm publish --provenance --access public` (`id-token: write`), authenticated by the repository secret `NPM_TOKEN` (granular automation token, scoped to the package). After the first publish exists the owner can configure npm trusted publishing (OIDC) for the repository and workflow, and remove the token. Provenance is passed as a CLI flag, not in `publishConfig`: with it in `publishConfig`, `npm publish --dry-run` fails outside GitHub Actions.
- **Dual publish, time-boxed:** for the first two npmjs releases a second job publishes the same tarball content to GitHub Packages as `@tormozz48/postgrelize`. The name, `publishConfig.registry` and `description` (starting with `DEPRECATED`, pointing to `postgrelize`) are rewritten at publish time inside the workflow (`npm pkg set`), so the repository has exactly one name. Provenance is not requested for the mirror (GitHub Packages does not support it). The mirror job runs after the npmjs job and only if it succeeded.
- **Retirement of the old name:** docs and the README say the scoped name is deprecated and show how to move. After the second release with the mirror, the mirror job is deleted from `release.yml` (own PR) and the owner marks the scoped package deprecated (`npm deprecate`, if the GitHub Packages registry rejects it, the last mirror release already carries the `DEPRECATED` description and the repository README points to the new name) and later may delete old versions. Existing `@tormozz48/postgrelize@0.x` installs keep working: versions are never removed by this change.
- **Checks without secrets:** CI runs `scripts/check-package.mjs` on every PR (name, `publishConfig`, metadata fields, tarball allow-list via `npm pack --dry-run --json`) and `npm publish --dry-run`. No new dependency: `publint` / `@arethetypeswrong/cli` are one-off local `npx` checks.

## Rejected alternatives
- **Keep only `@tormozz48/postgrelize`, scoped, on npmjs.** No migration for users, but the name is worse for discovery and does not match the docs and imports. Rejected by the owner.
- **No mirror (hard cut).** Smallest release surface, but users of the scoped name stop getting fixes with no signal other than the docs. Rejected: one or two mirrored releases cost one small job and give a migration window.
- **Permanent dual publish.** Keeps both audiences forever but doubles the release surface, the support questions and the supply-chain exposure (two names, two credentials). Rejected: the mirror is time-boxed.
- **Rename the name in the repository's `package.json` per registry (two branches or two manifests).** Drift risk. Rejected: rewrite at publish time.
- **Long-lived `NPM_TOKEN` forever.** Rejected as the end state: trusted publishing removes the stored secret. The token is needed only because npm trusted publishing can be configured only for a package that already exists.

## Consequences
- The first tag publishes both names (npmjs first, mirror second). A failed npmjs job prevents the mirror; a failed mirror job does not undo the npmjs publish (re-run the job or publish the mirror by hand).
- Nothing in the repository depends on the scoped name except the mirror job, the deprecation notes and history in `.10x/`.
- The owner must create the token and the `NPM_TOKEN` secret before the first tag (`docs/maintainers-npm-setup.md`).
- S18b polishes the docs (badges, migration note); S18c is the first release.
