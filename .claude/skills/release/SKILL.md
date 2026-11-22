---
name: release
description: Cut and publish a postgrelize version. Use when the maintainer asks to release, publish, tag or cut a version (for example "release 0.13.0", "publish to npm", "tag v1.0.0"). Runs the preflight, prepares the release PR, tags, watches the release workflow and verifies npm. Never use without an explicit maintainer request.
---

# Release postgrelize

Full flow for publishing `postgrelize` to npmjs.com (ADR-028) plus the deprecated GitHub Packages mirror. Rules live in `AGENTS.md` ("Git, PRs and releases"); this file is the step-by-step procedure. When you change the flow, update this file, `AGENTS.md` and `docs/maintainers-npm-setup.md` in the same PR.

## 0. Approval gate

- Start only when the maintainer explicitly asked for a release in this conversation. A merged feature, a green CI or a "ready to ship?" question is not a request. Approval for one version does not cover the next.
- Ask which version `X.Y.Z` if it was not given. Check it against the changelog with the preflight (below): while < 1.0 a breaking change is a minor bump and everything else a patch bump; from 1.0 a breaking change is major, a feature (Added/Removed) minor, a fix patch. If the maintainer's version is smaller than the changelog needs, say so and ask; a larger one (for example 1.0.0) is the maintainer's call.
- Never tag, push a tag or publish on an assumption. Never run `npm publish` by hand: only `release.yml` publishes.
- Never print, request, paste or store a token. npm publishing uses trusted publishing (OIDC), there is no token in the repository. If a command needs a token you do not have, stop and tell the maintainer.
- If `gh` answers `Bad credentials`, retry with `env -u GH_TOKEN gh …`.

## 1. Preflight before the bump

On an up-to-date `main` with a clean tree:

```bash
npm run release:preflight -- X.Y.Z --before-bump
```

The preflight does not repeat what CI already ran on the same commit. `CI green on release commit` looks up the GitHub workflow runs for `HEAD` and decides what runs locally:

| Situation | Local run |
| --- | --- |
| `main`, every run green (CI, Docs, CodeQL) | Skips lint, format, typecheck, `npm run docs`, the test suites, `test:build` as `SKIP covered by CI run <url>` (the `CI` run covers them, the `Docs` run covers `test:coverage`). Runs the checks CI does not make: branch, tree, origin, tag, semver, changelog and bump size, `llm:build` freshness, `build` (needed for the pack check), `npm pack` content, npm registry state, bench-gate reminder |
| `main`, CI red, still running, or no run found | The check **fails** (the final `PASS` is impossible). All local steps run as before, so you see the failure |
| release branch, no CI run yet (before the PR) | The check passes as deferred. Skips the long steps as `SKIP not run locally, CI runs it on the release PR` and coverage as `…the Docs run on main checks it after the merge`; runs the cheap ones. The summary says CI was not checked |
| any, `--full` | Ignores CI and runs everything locally (database up, `npm run db:up`): lint, format, typecheck, docs, `decorators-legacy`, build, `test:build` and one `test:coverage` run (unit, integration, compat, docs examples, thresholds) |

What CI runs (`ci.yml`): lint, format, typecheck, `test:unit` (unit + `decorators-legacy`), build, `test:build` on Node 20/22/24, `npm run docs` on Node 22, the package check, and `test:db` (integration, compat, docs examples) on PostgreSQL 16/17/18. Coverage thresholds run only in `docs.yml`, on pushes to `main`. When the suites run locally, `npm run test:coverage` is the single run (it executes the unit, integration, compat and docs projects), plus the `decorators-legacy` project it does not include.

Exit criteria: final line `PASS`, exit code 0. Read the whole table, including every `SKIP` and its reason. Any `FAIL` blocks the release: fix it in its own PR (or tell the maintainer), then rerun. Do not edit the script to make it pass. `NOTE bench gate` means query code changed since the last tag: run the gate from `AGENTS.md` (3 runs + `bench/compare.ts`) on a quiet machine and report the numbers. `--fast` skips the long runs; it is for iterating only, never for the real gate (`--fast` and `--full` cannot be combined). Use `--full` when CI is unavailable or you distrust it; never loop the full local run on a loaded machine to "pass" a flake, read the CI result instead.

Also check by hand what the script cannot: the `[Unreleased]` lines read well (one plain line each, PR link), user-visible changes of every merged PR since the last tag are present (`git log <lastTag>..HEAD --merges`), README, guide pages and `docs/guide/migrating.md` describe the released behaviour, and nothing describes planned features as if they exist.

## 2. Release branch and PR

```bash
git switch -c chore/release-X.Y.Z
npm version X.Y.Z --no-git-tag-version
```

- `CHANGELOG.md`: rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD` (today), add a new empty `## [Unreleased]` above it, update the links at the bottom: `[Unreleased]: …/compare/vX.Y.Z...HEAD`, `[X.Y.Z]: …/compare/v<previous>...vX.Y.Z`. `tests/docs/changelog.test.ts` checks the structure. If the release graduates the version scheme (1.0.0), the semver sentence in the changelog intro and in `AGENTS.md` ("Semver while < 1.0") changes in the same PR.
- `.10x/status.md` and `.10x/handoff.md`: current version and open items.
- Run `npm run release:preflight -- X.Y.Z` on the branch (default mode, after the bump). Its `branch` check accepts `chore/release-X.Y.Z`. It must pass. The branch has no CI yet, so the long suites show as `SKIP not run locally` (the release PR's CI runs them before the merge); it still checks the changelog sections and links, `package.json`, generated files, `build` and the pack content.
- Commit `chore(release): X.Y.Z`, push the branch, open the PR. Fill the "Release PR" part of the template.

Merge only after CI is green (this is where the suites run for the release commit): read the result of every check (`gh pr checks <n>` or `gh run view`), then `gh pr merge <n> --merge` as a separate command. Never chain the merge after a wait without reading the output.

## 3. Tag and publish

```bash
git switch main && git pull --ff-only
npm run release:preflight -- X.Y.Z
```

All must pass on the merge commit, including `CI green on release commit`: it fails while CI or Docs on the merge commit are running or red, so wait for them and the long suites show as `SKIP covered by CI run <url>`. Then, and only then:

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

Push the tag only: never `git push --tags`, never push `main`. Watch the run (`gh run watch` or `gh run list --workflow release.yml`) and read each job: `ci` (gate), `publish-npm` (version check, publish with provenance), `publish-github-packages` (mirror), `github-release` (notes from the `CHANGELOG.md` section). All four must be green.

## 4. Post-release verification

```bash
npm view postgrelize version        # X.Y.Z
npm view postgrelize dist-tags      # latest: X.Y.Z
d=$(mktemp -d) && cd "$d" && npm init -y >/dev/null && npm i postgrelize pg \
  && node -e "import('postgrelize').then(m => console.log(Object.keys(m).length))" \
  && node -e "console.log(Object.keys(require('postgrelize')).length)"
```

Also check: the docs site (https://tormozz48.github.io/postgrelize/) deployed by `docs.yml` shows the release; the npm package page shows the Provenance badge; the GitHub Release page exists with the changelog text; the mirror page https://github.com/tormozz48/postgrelize/pkgs/npm/postgrelize has the version.

Record it: `state(delivery): record X.Y.Z release` in `.10x/status.md` and `.10x/decisions/devops-engineer/…` via a PR (branch `chore/…`, merge commit after green CI). Report to the maintainer: PR links, tag, workflow run URL, `npm view` output, what you could not verify.

## 5. Failure handling

- A published version is immutable: never move, delete or reuse a published tag or version, and never `npm unpublish` without the maintainer. Fix forward with the next patch (`X.Y.Z+1`) through the same flow.
- Preflight fails: nothing is tagged yet; fix and rerun.
- `ci` job fails after the tag exists, nothing published: ask the maintainer. A tag that has published nothing may be deleted (`git push origin :refs/tags/vX.Y.Z`, `git tag -d vX.Y.Z`) only with the maintainer's explicit approval, then fix on a new PR and retag the new merge commit. If in doubt, bump the patch instead.
- `publish-npm` fails before publishing (trusted publisher not configured or mismatching workflow/repository, `E401`/`E403`, "EOTP", name taken): do not retry blindly and do not ask for the token. Tell the maintainer to follow `docs/maintainers-npm-setup.md` (Trusted Publisher: owner `tormozz48`, repository `postgrelize`, workflow `release.yml`, environment empty). After it is fixed, re-run the failed jobs (`gh run rerun <id> --failed`) of the same tag: the code is unchanged, so this is allowed as long as `npm view postgrelize versions` does not list X.Y.Z.
- `publish-npm` succeeded but `publish-github-packages` or `github-release` failed: the npm release is good, do not bump. Re-run the failed job (`gh run rerun <id> --failed`); if it keeps failing, report it and open a fix PR for the workflow. A missing GitHub Release can be created from the changelog section with `gh release create vX.Y.Z --notes-file …` after the maintainer agrees.
- `npm view` shows the version but install or import fails: stop, tell the maintainer, prepare a patch fix; deprecating the bad version (`npm deprecate`) is the maintainer's call.
