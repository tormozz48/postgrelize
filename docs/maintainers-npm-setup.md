# Maintainer setup: publishing to npmjs.com

Steps only the package owner can do. Design: ADR-028 (`.10x/adrs/028-npmjs-publishing.md`). Never paste a token into a chat, an issue, a commit or a log.

## Once, before the first npmjs release

1. **Account and 2FA.** Sign in to https://www.npmjs.com with the owner account. Enable two-factor authentication (Account → Two-Factor Authentication, "Authorization and publishing").
2. **Check the name is still free:**
   ```bash
   npm view postgrelize
   ```
   `E404` means free. If a package comes back, stop and decide on a new name (ADR-028 must change).
3. **Create the token.** Account → Access Tokens → Generate New Token → **Granular Access Token**:
   - Permissions: Read and write, **Bypass two-factor authentication** enabled (CI cannot enter an OTP).
   - Packages: a granular token can only be scoped to packages that exist. For the very first publish choose "All packages" with a short expiry (for example 7 days), then replace it with a token scoped to `postgrelize` (or switch to trusted publishing, below) once the package exists.
   - Expiration: as short as you tolerate; write the renewal date down.
4. **Add the repository secret** named exactly `NPM_TOKEN`:
   ```bash
   gh secret set NPM_TOKEN --repo tormozz48/postgrelize
   ```
   (paste the token at the prompt), or Settings → Secrets and variables → Actions → New repository secret.
5. **Verify the secret exists** (the value is never shown): `gh secret list --repo tormozz48/postgrelize` must list `NPM_TOKEN`. Do this before every tag; `npm run release:preflight -- X.Y.Z` does it for you (full release flow: `.claude/skills/release/SKILL.md`).
6. The GitHub Packages mirror needs no setup: it uses the workflow's `GITHUB_TOKEN`.

## After the first publish

- `npm view postgrelize version dist-tags` shows the new version and `latest`.
- The package page on npmjs.com shows the **Provenance** badge linking to the `release.yml` run.
- In a clean directory: `npm init -y && npm i postgrelize pg`, then `node -e "import('postgrelize').then(m => console.log(Object.keys(m).length))"` and the same with `require`.
- Packages → `postgrelize` → Settings: replace the broad token by a token scoped to `postgrelize`, or go to the next section.
- The mirror: `https://github.com/tormozz48/postgrelize/pkgs/npm/postgrelize` shows the new version with the `DEPRECATED` description.

## Switch to trusted publishing (drops the token)

1. npmjs.com → package `postgrelize` → Settings → Trusted Publisher → GitHub Actions: owner `tormozz48`, repository `postgrelize`, workflow `release.yml`, environment empty.
2. In `release.yml` remove the `NODE_AUTH_TOKEN` env line from the npm job (the job already has `id-token: write`; trusted publishing needs npm ≥ 11.5.1: add a step `npm install -g npm@^11.5.1` before publishing).
3. Release once to confirm, then delete the `NPM_TOKEN` secret and revoke the token on npmjs.com.

## Retire the scoped package `@tormozz48/postgrelize`

1. After the second release that includes the mirror job, delete the `publish-github-packages` job from `release.yml` (own PR).
2. Try `npm deprecate "@tormozz48/postgrelize@*" "Moved to postgrelize on npmjs.com: npm i postgrelize" --registry=https://npm.pkg.github.com` with a GitHub token that has `write:packages`. GitHub Packages may not implement `npm deprecate`; if it errors, the `DEPRECATED` description of the last mirror release and the README are the signal. Optionally delete old versions in the GitHub UI later (existing installs of those versions then break, so wait).
