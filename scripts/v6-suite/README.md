# v6 suite

Runs Sequelize v6's own mocha tests (`test/unit`, `test/integration`, pinned in `config.json`) against the built postgrelize
(`dist/index.cjs`) and compares the failures with `baseline.json`. It is gate 1 of
`.10x/specs/2026-11-22-v6-compat-gate-design.md`.

```bash
npm run build
npm run v6:db                                   # PostgreSQL on localhost:54399 (own container)
npm run v6:suite -- unit                        # or integration; --filter=<regex>, --strict
npm run v6:suite -- integration --update-baseline
npm run v6:db:down
```

Safety: v6's tests drop every table, enum and schema of their database and one of them crashed a backend of the development
server. The runner refuses port 54329 and uses databases `v6_suite_w0..N` of `PGZ_V6_DB_URL`
(default `postgres://postgres:postgres@localhost:54399/postgres`).

## How it works

`prepare.ts` clones the pinned tag into `.v6-suite/v6` (untracked; commit checked, never built), copies `test/` to `.v6-suite/work`,
patches three lines of `test/support.js` (the abstract query generator import, `modelManager.models`, the `supports.schemas` check),
installs the pinned test dependencies with `--ignore-scripts`, and writes the adapter: `node_modules/sequelize` is a proxy to
postgrelize, `sequelize/lib/<x>` maps to the postgrelize equivalent (or fails with a clear message), and `sequelize.dialect` carries
v6's own PostgreSQL `supports` table. `run.ts` runs one mocha process per file, four at a time, one database per worker, collects
the failing test titles (`adapter/reporter.cjs`) and compares them with the baseline (`compare-lib.ts`). Files with regressions are
run once more, alone, to rule out timeouts under load.

## Baseline

`--update-baseline` runs the kind twice: a file whose failures differ between the runs, or that has a failing `before`/`after` hook (which
aborts the rest of a suite at a point that varies), is stored as `unstable` and compared only by its passing tests (10% tolerance).
The baseline holds 5 such files today; each is a reason to look at why a hook fails.

`baseline.json` lists the tests expected to fail and the files expected not to load. It only shrinks: a failure that is not listed
is a **regression** (exit 1); an entry that no longer fails is **stale** (reported, exit 1 with `--strict`): delete it. Do not
add failures to hide a regression. A failure that is a deliberate difference (ADR-016) needs its own entry in a reviewed list;
the baseline does not yet separate causes, see the design's staged plan (G5).

CI: `.github/workflows/v6-suite.yml`, nightly and on demand, not a required check.
