# ADR-006: CI/CD on GitHub Actions, publish to GitHub Packages

**Status:** Accepted
**Date:** 2026-11-14
**Feature:** postgrelize-mvp
**Author:** 10x-Team (Architect + DevOps)

## Context
User requirement (2026-11-14): CI for code acceptance on GitHub Actions — build, tests, and package publishing to GitHub. Supersedes the "npm publishing out of scope" non-goal in the spec. Repo: `tormozz48/postgrelize`.

## Decision
- **Workflow `ci.yml`** (push to `main`, all PRs): job `check` (install → lint → format:check → typecheck → unit tests → build → build smoke test, uploads `dist` artifact) and job `db-tests` (integration + compat, matrix `postgres:16/17/18` service containers). Required checks for merge.
- **Workflow `release.yml`** (push of tag `v*.*.*`): reruns full check + db tests on PG16, verifies tag == `package.json` version, `npm publish` to `https://npm.pkg.github.com` with `GITHUB_TOKEN` (`packages: write`), `--provenance` not used (GitHub Packages doesn't support it). Prerelease tags (`v1.0.0-beta.1`) publish under dist-tag `next`.
- **Package name** `@tormozz48/postgrelize` (GitHub Packages requires owner scope). Users wanting drop-in import name use alias: `"postgrelize": "npm:@tormozz48/postgrelize@^x"`.
- Node 22 in CI (engines ≥ 20; plus matrix node 20 on `check` for compat).

## Alternatives Considered
| Alternative | Pros | Cons | Why Not |
|---|---|---|---|
| Publish to npmjs.org | Unscoped `postgrelize`, public discoverability | Needs npm token/account; user asked for GitHub | Not requested; can be added later as second registry |
| Publish on every main push (snapshot) | Fast feedback | Version noise | YAGNI |
| changesets / semantic-release | Automated versioning | Extra tooling | YAGNI for now; manual `npm version` + tag |

## Consequences
### Positive
- Single platform; no external secrets (GITHUB_TOKEN).
### Negative
- Consumers need `.npmrc` with `@tormozz48:registry=https://npm.pkg.github.com` and a token with `read:packages` (even for public packages).
### Risks
- Tag/version mismatch → guarded by version check step.

## Dependencies
ADR-004 (test suites), spec §9.
