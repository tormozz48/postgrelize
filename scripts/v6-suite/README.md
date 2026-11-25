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
The baseline holds 29 such files at 2026-11-25; each is a reason to look at why a hook fails or why a file differs between runs.

`baseline.json` lists the tests expected to fail and the files expected not to load. It only shrinks: a failure that is not listed
is a **regression** (exit 1); an entry that no longer fails is **stale** (reported, exit 1 with `--strict`): delete it. Do not
add failures to hide a regression.

### Causes

Every entry has a cause. `baseline.json` has a top-level `causes` object (root causes by id: `cause`, `area`, `note`, plus `risk`,
`repro` and `test` for a `bug`, `ref` for a `divergence`), and each file points its failing titles at an id in `causes`
(`"causes": { "<title>": "<id>" }`; a file that does not load has `"cause": "<id>"`). One root cause is recorded once and shared by the
tests it breaks.

| `cause`        | Meaning                                                                                                                                             |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bug`          | Real postgrelize gap, v6 behaviour expected. Needs `risk` (`data-loss`, `wrong-result`, `error`, `wording`, `cosmetic`) and a one-line `repro`.     |
| `divergence`   | Deliberate difference (ADR-016, postgres-only). Needs `ref`: an ADR or a `docs/sequelize-issues.md` row.                                            |
| `harness`      | Adapter or test-environment artefact: v6 private internals (`queryGenerator`, `_scope`), stubs of v6 internals, unmapped `sequelize/lib/*` imports. |
| `unsupported`  | v6 feature postgrelize does not implement: other dialects, PostGIS types in the suite container.                                                    |
| `flaky`        | Timing or ordering dependent.                                                                                                                       |
| `triage`       | Assertion difference whose root cause is not found yet. Counts as classified, listed in the report; turn it into one of the above.                  |
| `unclassified` | Written by `--update-baseline` for a new failure. The run exits 1 until you replace it.                                                             |

`--update-baseline` keeps the cause of every entry that still fails and marks new ones `unclassified`; give each a cause (reuse an id
of `causes` or add one) before committing. `npm run v6:suite -- --summary` prints the counts by cause and area. The checks live in
`checkCauses` and `summarizeCauses` (`compare-lib.ts`, tested in `tests/unit/scripts/v6-suite-compare.test.ts`). The first
classification and the fix order are in `.10x/reviews/2026-11-25-v6-baseline-causes.md`.

CI: `.github/workflows/v6-suite.yml`, nightly and on demand, not a required check.

## Triage of the baseline (G5)

State at v6.37.8, PostgreSQL 17, postgrelize 1.9.3: unit 261 pass / 332 fail (68 of 101 files load), integration 1289 pass / 316 fail
(125 of 135 load); 691 baseline entries in all. Every entry has a cause: 267 `bug` (134 root causes), 356 `harness`, 47 `unsupported`,
18 `divergence`, 3 `triage`. The full report (counts by area, bugs ranked by user risk with reproductions and v6 test names, proposed
fix order) is `.10x/reviews/2026-11-25-v6-baseline-causes.md`. Fix one `bug` area per PR and delete its entries (the run lists them as
`STALE`); `.v6-suite/last-run-<kind>.json` keeps the first error line of every failing test.
