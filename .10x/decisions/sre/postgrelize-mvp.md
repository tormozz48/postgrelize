# SRE — postgrelize-mvp

postgrelize is a library: it has no service, SLOs or on-call of its own. Reliability concerns are those it creates for host applications and for its release pipeline.

## Host-application reliability
- Pool: `pool.max` (default 5), `pool.acquire` → `ConnectionAcquireTimeoutError`, `pool.idle`; idle-client errors are swallowed so a dropped connection does not crash the process.
- Clients are always released (`finally`) — leak-free on thrown errors; transactions release on commit/rollback.
- Observability hooks: `logging` (SQL + bind values) and `benchmark: true` (duration in ms) per instance or per query; errors carry `sql` / `parameters` / `original`.
- Timeouts: use `dialectOptions.statement_timeout` / `query_timeout` (passed to `pg`); `57014` maps to `TimeoutError`.

## Release pipeline
- Health signal: CI on `main` (check + db-tests on PG 16/17/18). A red `main` blocks releases.
- Runbook — release failed:
  1. `release.yml` failed at "Verify tag" → tag ≠ package.json version: delete tag (`git push --delete origin vX.Y.Z`), fix version, re-tag.
  2. Failed at tests → fix on main, bump patch, re-tag (never move a published version).
  3. Bad version published → `npm deprecate @tormozz48/postgrelize@X.Y.Z "<reason>"` and publish a patch.
- Runbook — docs deploy failed: check Settings → Pages → Source = GitHub Actions; re-run `docs.yml` via workflow_dispatch.

## Escalation
Repository owner (tormozz48) via GitHub issues.
