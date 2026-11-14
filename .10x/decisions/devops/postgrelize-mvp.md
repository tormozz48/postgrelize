# DevOps — postgrelize-mvp

## Workflows
| File | Trigger | Jobs |
|---|---|---|
| `ci.yml` | push `main`, PRs, `workflow_call` | `check` (Node 20/22): npm ci → lint → format:check → typecheck → test:unit → build → test:build → docs (Node 22) → upload `dist`; `db-tests` (PG 16/17/18 services): test:db |
| `release.yml` | tag `v*.*.*` | reuse `ci.yml` → verify tag = package.json version → `npm publish` to npm.pkg.github.com (`next` dist-tag for prereleases) with `GITHUB_TOKEN` |
| `docs.yml` | push `main`, manual | TypeDoc → upload-pages-artifact → deploy-pages |

## Release procedure
1. `npm version <patch|minor|major|prerelease>` on main (creates commit + tag `vX.Y.Z`).
2. `git push --follow-tags`.
3. `release.yml` tests and publishes `@tormozz48/postgrelize`.

## Rollback
GitHub Packages versions can't be overwritten; publish a fixed patch version. Deprecate bad version: `npm deprecate @tormozz48/postgrelize@X.Y.Z "reason"`.

## One-time repo setup (manual, owner)
- Settings → Pages → Source: GitHub Actions.
- Settings → Branches: protect `main`, require checks `check (20)`, `check (22)`, `db-tests (16/17/18)`.
- Packages: after first publish, link package to repo / set visibility.

## Local parity
`docker-compose.yml` (postgres:${PGZ_PG_VERSION:-16}, port 54329, tmpfs) mirrors CI service.
