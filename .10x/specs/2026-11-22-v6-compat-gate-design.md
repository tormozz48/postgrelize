# v6 compatibility gate (feasibility study and plan)

**Date:** 2026-11-22 · **Status:** proposed; study only, nothing implemented · **Measured against:** postgrelize 1.2.0 (`ae7bd7b`), `sequelize@6.37.8` (tag `v6.37.8`, `cb7f99ad05de56137672ab95586359ff6ceba004`), PostgreSQL 16.

## Why

postgrelize claims to be a drop-in for Sequelize v6, but compatibility has been checked only on scenarios we wrote ourselves: the differential tests in `tests/compat`, the names-only API-surface test (`tests/unit/api-surface.test.ts`) and a type-parity corpus built from consumer call sites (`tests/compat/type-parity`). v6's own tests and declarations were never run against us. A large consumer (ddt) therefore keeps finding gaps (`afterConnect`, `retry`, `connectionManager`, Model-family types, `findByPk` `rejectOnEmpty`, `replacements` on finders). The aim is a measurable gate derived from v6 itself, so gaps are found before a consumer finds them.

## Summary of the measurements

| Gate | What runs | Measured result (1.2.0) | Cost to adopt |
| --- | --- | --- | --- |
| 2. v6 `test/types` vs our `.d.ts` | all 32 files of `test/types`, `tsc` once | 11 of 32 files compile clean; 248 errors in 21 files (v6 itself: 0 errors) | low: ~4 s of `tsc`, a vendored or cloned corpus, one allow-list |
| 3. Declaration diff (compiler API) | 356 v6 exports, 104 classes/interfaces, 1750 members | 148 v6 names missing; 540 members missing on 68 types; 9 generic-parameter mismatches; 11 arity mismatches; ~2 s | low to medium: 1 script of ~60 lines already works; noise filters and an allow-list needed |
| 1. v6 mocha suites on postgrelize | 101 unit + 135 integration `.test.js` files (PostgreSQL), through an alias and two adapters | integration: 877 pass / 446 fail in 125 of 135 files that load; unit: 193 pass / 245 fail in 68 of 101 files | high: needs an adapter layer, a per-test baseline and a CI job of several minutes |

All three gates found real gaps within an hour of work (see "Real gaps found by the spike"), which is the argument for doing them in the order below.

Timings were taken on a machine at load 11 to 40 (8 cores), so absolute durations are upper bounds.

## Gate 1: run v6's own test suite against postgrelize

### What the v6 suite is

`test/unit`: 107 files (101 `.test.js`, plus `.ts` and `.d.ts`), 742 `it(` calls. `test/integration`: 135 files, 2144 `it(` calls. mocha 7, chai 4, sinon 12, `chai-as-promised`, `chai-datetime`, `sinon-chai`, `lodash`, `moment`, `delay`, `p-props`, `cls-hooked` and others. Every test file loads `test/support.js`, which does `require('sequelize')` and `require('sequelize/lib/dialects/abstract/query-generator')`, reads `test/config/config.js` (environment `SEQ_PG_*`), and builds `Support.sequelize`. The dialect is selected with `DIALECT=postgres`; tests for other dialects are not even registered, so a PostgreSQL run executes 438 unit and 1323 integration cases (pass plus fail) out of the 742 and 2144 textual `it(` calls.

### Static classification (grep over the sources, `classify.js`)

| | unit (101) | integration (135) |
| --- | --- | --- |
| requires `sequelize/lib/<x>` that postgrelize does not expose (`utils`, `dialects/*`, `associations/*`, `connection-manager`, `utils/logger`, `instance-validator`, ...) | 19 files | 7 files |
| touches `queryGenerator` / `QueryGenerator` | 32 | 10 |
| touches `.dialect`, `connectionManager`, `modelManager`, `_dialect` | 45 | 57 |
| stubs or spies with `sinon` | 37 | 32 |
| internals by the first two rows | 41 | 16 |
| internals by any of the first three rows | 54 | 62 |
| no internals and no sinon ("public-API-ish") | 26 | 61 |

`require('sequelize/lib/data-types')` alone appears 139 times; it maps cleanly to `DataTypes`. The three internal groups are exactly what postgrelize chose not to replicate (`modelManager`, `queryGenerator`, `dialect`, `connectionManager` internals are in `tests/compat/api-surface-exceptions.json` as "v6 internals").

### Spike setup (reproduce)

Everything lives in a scratch directory outside the repo. Nothing from the v6 clone is run except mocha on its test files; its install scripts are never run (`npm i --ignore-scripts`).

```bash
S=$(mktemp -d)                                  # scratch root, not in the repo
git clone --depth 1 --branch v6.37.8 https://github.com/sequelize/sequelize.git $S/v6src
git archive HEAD | tar -x -C $S/pgz && ln -s "$PWD/node_modules" $S/pgz/node_modules && (cd $S/pgz && npm run build)
# tooling: mocha@7 chai@4 chai-as-promised@7 chai-datetime@1 sinon@12 sinon-chai@3 lodash moment delay@5 p-props@4
#          semver uuid@8 p-timeout@4 cls-hooked p-settle@4 p-map@4 js-combinatorics fs-jetpack pg validator
(cd $S/tool && npm i --ignore-scripts mocha@7 chai@4 ...)
cp -R $S/v6src/test $S/g1/test                  # a copy; the clone stays untouched
```

The adapter has three parts, all outside the v6 tree:

1. **Module alias.** `node_modules/sequelize/index.js` in the work dir exports a `Proxy` over postgrelize's `Sequelize` class (static properties fall back to the module namespace, because v6's `require('sequelize')` is the class itself). `register-shim.js` (`-r`) intercepts `require('sequelize/lib/<x>')` for the few that have a public equivalent (`data-types`, `errors`, `operators`, `transaction`, `model`, `sequelize`, `query-types`) and throws `no postgrelize equivalent` for the rest, so internals show up as a counted load failure.
2. **`test/support.js` patch** (3 lines, `patch-support.sh`): replace the `AbstractQueryGenerator` import with an empty class, guard `sequelize.modelManager.models = []`, skip the `queryGenerator._dialect.supports.schemas` branch.
3. **`sequelize.dialect` shim** (round 2): define `Sequelize.prototype.dialect` returning `{ name: 'postgres', supports }` where `supports` is v6's own PostgreSQL `supports` table. Tests read `current.dialect.supports.*` at describe time in 36 integration files; without it those files do not load.

Runner: one mocha process per file (`run-all.js`), 4 workers, one scratch database per worker, a custom reporter writing JSON. Command: `DIALECT=postgres SEQ_PG_* SPIKE_DIALECT_SHIM=1 node run-all.js integration 4`. Scripts and raw results are in the shared notes folder of the study (`v6-gate/spike-scripts`, `gate1-*.txt`).

**Safety finding.** The first integration run went against the shared development PostgreSQL of this repository (`npm run db:up`). A v6 integration test made one backend exit with code 2, the postmaster restarted all backends, and every connection of that server (other test runs included) failed for a few seconds (`the database system is in recovery mode`). The server came back healthy. A gate must therefore never share a server with development databases: use a dedicated container or a CI service. All reported numbers come from the rerun on a throwaway container. The test that crashed the backend was not identified.

### Results

| | files | loaded | pass | fail | not loaded |
| --- | --- | --- | --- | --- | --- |
| unit, no shim | 101 | 49 | 192 | 138 | 52 |
| unit, with dialect shim | 101 | 68 | 193 | 245 | 33 |
| integration, no dialect shim (first run, shared server, partly polluted by the crash) | 135 | 87 | 388 | 240 | 48 |
| integration, with dialect shim, isolated server | 135 | 125 | 877 | 446 | 10 |

In the final integration run 19 files pass fully and 61 pass partly. For the "public-API-ish" files of the static table: 61 integration files gave 318 pass and 148 fail (2 not loaded); 26 unit files gave 29 pass and 30 fail (2 not loaded). The mixed 74 integration files with internals still gave 559 pass and 298 fail, which shows that touching `dialect.supports` or a `sinon` spy usually fails only a part of a file.

Failure classes (heuristic regex buckets over 446 integration and 245 unit failures, `buckets.js`; one real cause often fails many cases of a file, so counts overstate distinct bugs):

| Class | Integration | Unit | Meaning |
| --- | --- | --- | --- |
| Harness internals: `modelManager`, `queryGenerator.*`, `connectionManager._clear*`, `sinon` stubs of `Query` / `insert` | 14 + part of "SQL/DB" | 11 + about 60 inside "TypeError (other)" (`addIndexQuery`, `addConstraintQuery`, `insertQuery`, ...) | Intentional (golden rule 3 and "v6 internals" exceptions). Exclude with category `internal`. |
| Real gap: `BelongsTo#get` with an array of instances (`instance.get is not a function`) | 23 | 0 | v6 accepts `Task.associations.user.get([t1, t2])`. See below. |
| Real gap: `define('m')` without attributes (`'createdAt' in undefined`) | 11 | 13 | v6 accepts it. |
| Real gap: `ValidationError#get(path)` missing | 0 | 37 | v6 has `get(path)` returning the items of one path. |
| Real gap: `Model.beforeAssociate` / `afterAssociate` | 0 | 8 | Already in the API-surface allow-list as "not planned". |
| Real gap: `references: { model: { tableName, schema } }` crashes (`name.replaceAll is not a function`) | about 2 | 0 | v6 issue #9029 scenario. |
| Error message wording asserted by the test (`rejected with an error including '...'`) | 43 | 30 | Often a message postgrelize words differently or does not throw (`replacements`/`bind` conflict text, `pool:false` message, mysql URI message). Needs per-case triage: a wording difference is "won't fix", a missing throw is a gap. |
| `EagerLoadingError` "associated multiple times ... use alias" | 24 | 0 | Needs triage: v6 throws the same text in some cases and not in others; probably a scenario where our include resolution disagrees. |
| SQL or DB error (missing relation, `Task.undefined`, `type "undefined"`) | 69 | 10 | Mostly cascades from a failed `beforeEach` (a model not defined) or a differing column naming; needs triage. |
| Assertion (other) | 164 | 22 | Not classified automatically; dominated by `alias`, `scope`, `has-many` files. |
| Server or harness (timeout, `Could not clear database`) | 8 | 1 | Cascades; the clean-up hook of `Support.clearDatabase` is fragile when a test leaves a transaction open. |

A deliberate ADR-016 divergence (a v6 bug fixed on purpose) is expected to show as an assertion mismatch in a handful of cases; none was confirmed in the sample read, so the share is unknown. They would be listed in the allow-list with category `v6-bug` and a link to the row of `docs/sequelize-issues.md`.

### Real gaps found by the spike (not yet verified against a consumer, but reproduced with v6's own test code)

1. **CommonJS entry is not constructable.** `new (require('postgrelize'))('postgres://...')` throws `is not a constructor`: the CJS entry is a namespace object. In v6 `require('sequelize')` is the class (`module.exports = Sequelize`). `docs/guide/migrating.md` says `require('postgrelize')` works; it works only as `require(...).Sequelize`. Plain-JS v6 code (`const Sequelize = require('sequelize')`) breaks.
2. **No default export in the ESM entry.** `import Sequelize from 'postgrelize'` fails with `does not provide an export named 'default'`. v6's `lib/index.mjs` has `export default Pkg` (the class). This is also in `api-surface-exceptions.json` as a "v6 internal" (`default`), which hides the migration impact.
3. `ValidationError#get(path)` is missing (`tests/unit/model/validation.test.js`, 37 cases).
4. `sequelize.define('m')` with no attribute argument throws inside `DefinitionNormalizer`.
5. `Association#get` (BelongsTo) does not accept an array of instances.
6. `references.model` as `{ tableName, schema }` object crashes in `IdentifierQuoter` (#9029).
7. `Model.beforeAssociate` / `afterAssociate` and `Model.beforeBulkSync` family are missing (already allow-listed).

Items 1 to 6 are not covered by `tests/compat` today.

### Exclusion mechanism (shrink-only, same idea as `api-surface-exceptions.json`)

A single `tests/v6-suite/exceptions.json`, validated by a unit test, with two kinds of entries and the same `{ name, category, note }` shape and a `MAX_` ratchet:

- **File or title rules** (a glob or a regex on the full title) for whole classes: `internal` (uses `queryGenerator` / `modelManager` / unmapped `lib/*`, about 40 unit and 16 integration files), `other-dialect` (not registered under `DIALECT=postgres`, nothing to do), `v6-bug` (ADR-016, with the issue row), `wording` (message text differs, intentional).
- **Expected-failure baseline**: a generated list of the full titles that fail today with category `tracked` and an issue or stage. The gate fails on a new failure and also on a case that starts passing and is still listed (so the list only shrinks, as `it.fails` does). At the measured sizes this list is about 450 integration titles and 245 unit titles at first; categorisation by rule reduces it to a few hundred explicit entries.

The categories match the existing ones (`not-planned`, `other-dialect`, `internal`, `tracked`) plus `v6-bug` and `wording`.

### CI cost and shape

- One extra job: PostgreSQL 16 service container, Node 22 only, `DIALECT=postgres`. The v6 clone is fetched by pinned commit (`git fetch --depth 1 origin <sha>`), cached by sha; the work dir is built by one script in `scripts/`.
- Time: the integration run took about 1170 s of summed per-file time under heavy load (about 10 min wall with 4 workers on an overloaded 8-core Mac). A standard 2-vCPU runner without load is expected at 6 to 10 minutes for integration and 1 to 2 minutes for unit; not measured on CI.
- First as a **non-blocking** job (`continue-on-error`) that uploads the JSON result and a diff against the baseline; make it required only after the baseline has been stable for two weeks and after the harness-internals rules are final.
- Matrix: no need for 16/17/18 or Node 20/24 in the first iteration; one Node and one PostgreSQL version. Add 18 later because several v6 tests assert error codes that vary little by version.
- Parallelism: each worker needs its own database (the v6 harness drops every table, enum and schema of its database between tests), so the job runs `max 4` workers with `v6suite_w0..3`. It must never use the development database (see the safety finding above).

### Maintenance risk

- v6 is in maintenance mode; 6.37.8 is the last release line, so pinning one tag has low churn. Updating the pin is a deliberate PR that re-generates the baseline.
- The adapter (alias, `support.js` patch, `dialect.supports` table) is about 60 lines and depends on v6 internals only for the `supports` table, which can be copied once into the repo as data.
- The v6 sources are MIT-licensed; fetching at CI time avoids vendoring them. The npm package of `sequelize` does not ship `test/`.
- Flaky v6 tests: some depend on timing (`delay`, `sleep`), on `cls-hooked`, or on the order of rows; a flaky case is allowed to join the baseline with category `flaky` only with a justification, to keep AGENTS.md's "no retries to hide flakes" rule.

## Gate 2: v6's `test/types` against our declarations

`test/types` holds 32 `.ts` files (`attributes`, `bulk-create`, `connection`, `create`, `data-types`, `define`, `destroy`, `errors`, `findByPk`, `findOne`, `hooks`, `include`, `infer-attributes`, `model`, `model-count`, `query-interface`, `sequelize`, `transaction`, `update`, `upsert`, `validators`, `where`, `usage`, `index-hints`, `models/*`, `typescriptDocs/*`, `e2e/docs-example.ts`, helpers). They use `expect-type` (0.12) and import from `sequelize`, `sequelize/lib/*` and `sequelize/types/utils`.

Setup: copy the folder, a tsconfig with `paths` mapping `sequelize` to the declarations under test, `strict`, `skipLibCheck`, `ignoreDeprecations: "6.0"` (the repo's TypeScript 6.0.3), `@types/{node,mocha,sinon,chai}`. Baseline: against v6's own `types/index.d.ts` the corpus has **0 errors** (after adding `sequelize/types/utils`), so every error against postgrelize is a difference. Against our built `dist/index.d.ts`: **248 errors, 21 of 32 files fail, 11 compile clean** (`attributes`, `destroy`, `errors`, `findByPk`, `infer-attributes`, `model-count`, `transaction`, `validators`, and the `models/UserGroup`, `models/UserPost`, `type-helpers/deep-writable` helpers). One `tsc` run: 4.3 s on a loaded machine.

Errors by file: `data-types` 68, `hooks` 65, `model` 34, `query-interface` 17, `e2e/docs-example` 9, `update` 8, `upsert` 7, `typescriptDocs/ModelInit` 7, `create` 7, `sequelize` 5, others 1 to 3.

Errors by TS code: 2554 (wrong argument count) 35, 2503 (namespace not found) 34, 2339 (property missing) 31, 2353 (unknown key in object literal) 21, 7019/7006/7009 (implicit any, mostly cascades of a failed overload) 49, 2322 (not assignable) 19, 2351/2349 (not constructable / callable) 29, 6234 5, 2307 and 2305 (module / export missing) 10, others 12.

Root causes (the 248 errors collapse to about 25 causes):

| Cause | Errors | Real gap or intentional |
| --- | --- | --- |
| `DataTypes` is a value only; `DataTypes.TinyIntegerDataType` etc. (type namespace) missing, and `DataTypes.TINYINT` and others not callable / constructable / without `.UNSIGNED.ZEROFILL` | about 100 (`data-types.ts`) | Real gap for type users (`DataTypes.StringDataType`); the MySQL-only `TINYINT` / `ZEROFILL` forms are intentional (other dialect). |
| Static hook methods on `Sequelize` (`Sequelize.addHook`, `beforeConnect`, `afterConnect`, `beforePoolAcquire`, `afterFind`, `beforeSave`, `afterSave`) | about 25 (`hooks.ts`) | The runtime allow-list says "not planned"; for TypeScript consumers they are real (ddt reported `afterConnect`). |
| `QueryInterface.select`, `insert`, `upsert`, `update`, `delete`, `quoteTable` | 8 | Mixed: `quoteTable` and `select` are public in v6; the rest are listed "not planned". |
| `logging: true` on options | 5 | Real gap (v6 allows `true`). |
| `IncludeOptions` / `FindOptions`: `as`, `paranoid`, `distinct`, `searchPath`, `indexHints` keys | about 9 | `distinct` / `paranoid` real; `searchPath` and `indexHints` intentional. |
| `getterMethods` / `setterMethods` in `InitOptions` | 2 | Real gap (v6 declares them; our `Model` types differ). |
| `ignoreDuplicates`, `duplicating`, `conflictWhere`, `fields`, `delimiter`, `charset`, `length` object-literal keys | 8 | Mixed (`conflictWhere` and `ignoreDuplicates` are intentional; `fields` / `length` need a look). |
| `Literal` / `Fn` / `Col` not assignable to `string`-branded attributes and `IndexField` | 6 | Real gap. |
| `Config`, `OrOperator`, `AndOperator`, `IndexHints` exports; `sequelize/lib/{hooks,query,query-types,associations}` deep type imports | 10 | Exports: real for `Config`, `OrOperator`, `AndOperator`; deep imports intentional. |
| `ModelStatic` cast, `Model.findByPk` zero-arg, 2/4-argument arity (`changeColumn`, `addIndex`, `bulkInsert`, ...) | about 40 | Real gaps; the `findByPk` and `reload` ones are in flight in the other session. |
| Cascade errors (implicit any after a failed overload) | about 45 | disappear with the above |

The `FindByPk` / `rejectOnEmpty` overload that ddt reported is exactly one of the 21 failing files' causes, which supports the claim that this gate would have found the reports earlier.

Exclusion model: a `tests/compat/v6-types/exceptions.json` keyed by file, each with `{ code, line-pattern or message-pattern, category, note }`, ratchet on the count, plus a check that an entry that no longer errors is removed. Alternatively, mark lines with `// @ts-expect-error` in a patched copy (a generated patch), which the compiler itself reports as unused when fixed: this gives shrink-only behaviour for free and is the cheapest. Whole-file exclusions (`index-hints.ts`) go in the same JSON as `other-dialect`.

CI cost: about 5 s of `tsc` plus a 32-file copy; fits in the existing `ci.yml` lint/typecheck job. Blocking from day one is realistic once the 248 errors are triaged into the allow-list. Maintenance: the corpus is pinned to the tag; the `expect-type` version is 0.12 (a `devDependency`, or a scratch install in the script).

## Gate 3: automatic comparison of exported declarations

Already in the repo: `tests/support/type-surface.ts` and `tests/compat/type-parity.test.ts` compare (a) exported type names (147 allow-listed) and (b) property names of 21 hand-picked option interfaces (72 allow-listed keys); `tests/unit/api-surface.test.ts` compares runtime names of 12 surfaces (139 allow-listed). Not compared: members of classes and interfaces (`Model`, `Sequelize`, `QueryInterface`, association classes, mixin options), parameter counts, generic parameters and defaults, kinds.

Spike: `compare.mjs` (about 60 lines, TypeScript compiler API, scratch only) loads both entry points, and for every exported name present in both compares the kind, generic parameter count and which have defaults, members of classes and interfaces (instance and static), and the min and max parameter counts of call signatures. Runtime: 2 s.

| Measure | Value |
| --- | --- |
| v6 exports / ours | 356 / 459 |
| missing names in ours | 148 (the 147 allow-listed names plus `WhereAttributeHashValue`, which the parallel type-parity work on the working tree already exports) |
| compared names | 208 |
| classes and interfaces compared | 104 (1750 v6 members) |
| types with at least one missing member | 68 (540 missing members) |
| generic parameter count or default mismatches | 9 |
| arity mismatches | 11 |
| kind mismatches (`interface` to `type` and similar) | 61 |

Examples that are real and match consumer reports: `FindOrCreateOptions` and the 20 association mixin option types lack `replacements`, `bind`, `type`, `instance`, `mapToModel`, `fieldMap`, `groupedLimit`; `FindAndCountOptions` lacks `distinct` and `col`; `Sequelize` lacks `beforeDefine`/`afterDefine`/`beforeInit`/`afterInit`, `modelManager`, `set`; `Options` lacks `dialectModule`, `dialectModulePath`, `storage`, `protocol`, `query`, `sync`, `omitNull`; `QueryInterface` lacks `insert`, `upsert`, `update`, `delete`, `select`, `increment`, `queryGenerator`; generics: `FindOrCreateOptions<TAttributes, TCreationAttributes>` is `FindOrCreateOptions<T>` for us, `InitOptions<M>`, `ModelAttributes<M, TAttributes>`, `and<T>`, `or<T>` and `where<Op>` take no type parameters; arity: `Model.update` (v6 3 parameters, ours 2), `Model.setAttributes`, `QueryInterface.addIndex` / `bulkInsert` / `bulkUpdate` / `bulkDelete` (one fewer), `createSchema` / `dropSchema` (we require the first argument), `findByPk` (we require 1 where v6 allows an overloaded zero-argument form).

Noise to filter before this can be a gate: symbol-keyed members (`__@eq@1135` in `WhereOperators`), the 126 validator.js methods of v6's `Validator` interface, members inherited through intersection types, `@internal`-style members (`_model`, `Sequelize.Sequelize`), `interface` to `type` kind changes that are source-compatible, and overload sets that compare by count only. Comparing parameter *types* (not only counts) is out of scope for the first version; the type-checked corpus of Gate 2 covers that. Effort: harden and test the script 1.5 days; allow-list triage (540 members, 9 generics, 11 arities) 1 to 2 days, mostly categorising by pattern (`__@`, `Validator`, `Sequelize` internals) rather than by entry. It extends, and can replace, the option-key part of `type-parity.test.ts`; the file format of its allow-list is reused.

## Recommended plan (smallest valuable first)

| Stage | Scope | Effort | Blocking? |
| --- | --- | --- | --- |
| G1 | Gate 2: pin `v6.37.8`, copy-or-fetch `test/types`, tsconfig with `paths`, `@ts-expect-error`-style or JSON allow-list, a `tests/compat/v6-types.test.ts` that runs `tsc` on both v6 (must be 0) and postgrelize (must equal the allow-list). Triage the 248 errors into categories and open one tracked issue per real cause. | 1.5 to 2 days | yes (in the existing compat job) |
| G2 | Gate 3: extend `TypeSurface` into a member/arity/generic diff with filters, allow-list `tests/compat/type-surface-exceptions.json`, ratchet. Replace the hand-picked `optionPairs` by the automatic option-key diff over all `*Options` interfaces. | 2.5 to 3.5 days | yes |
| G3 | Fix the cheap real gaps already found: CJS constructable entry and a default export (needs an ADR: changes `exports` shape of the package, must keep `import { Sequelize }`), `ValidationError#get`, `define('m')`, `BelongsTo#get(array)`, `references.model` object. Each with a differential test in `tests/compat`. | 1 to 2 days each | n/a |
| G4 | Gate 1 harness: dedicated container, alias plus adapter plus `dialect.supports` table as `scripts/v6-suite/*`, per-file runner and JSON reporter, `exceptions.json` with file rules for `internal`, baseline of expected failures, a non-blocking CI job and a PR comment with the diff. | 4 to 6 days | no, nightly first |
| G5 | Triage the baseline: unit `internal` rules, then integration association/include/alias families (biggest share of failures), fix gaps, shrink the baseline each release. Ongoing, one family per PR. | continuous | the job becomes required once the baseline is stable |
| G6 | Release gate: add `v6-gate` results to `release:preflight` and to the 1.x release checklist (numbers in the release note: "v6 tests passing: X of Y"). | 0.5 day | yes |

Reasoning for the order: G1 and G2 are cheap, deterministic, run in seconds, and cover exactly the kind of gap the consumer reports (types and option keys). G3 turns the first findings into fixes. G4 is the only expensive stage and its value depends on the allow-list work in G5, so it starts non-blocking.

## Risks and open questions for the maintainer

1. **Scope of "fully compatible".** The v6 suite also tests behaviour postgrelize intentionally changes (ADR-016 bug fixes, `retry`, hook coverage, `searchPath`). The gate measures "passing share of v6 tests with documented exceptions", not 100%. Which number should the release note quote?
2. **CJS and default import (findings 1 and 2).** Fixing them changes the package's export shape; it is probably a minor or a major depending on whether a default export is added next to the named exports. Needs an ADR; do you want it before G3?
3. **Shared development database.** A v6 test crashed a backend of the shared dev server. Should the repo's `db:up` stay as is, with the gate using its own container (`db:up:v6` or a service container in CI only)?
4. **Hooks.** Static `Sequelize.addHook` and instance hook methods are "not planned" in the runtime allow-list but are used in v6's type tests and by ddt. Reconsider the category, because a type-only addition would pass Gate 2 without runtime behaviour.
5. **Vendoring vs fetching** the v6 tests: fetching a pinned commit at CI time (preferred here) needs network in CI and a cache; vendoring adds about 4 MB of MIT-licensed test code to the repo.
6. **TypeScript version.** `test/types` were written for TypeScript 4.5; we compile with 6.0.3. v6 itself compiled clean under 6.0.3, so the baseline holds, but a future TypeScript may add errors on the v6 side; the gate checks the v6 side first so that such a change is visible as "baseline broke", not as a postgrelize regression.
7. **Not verified:** CI timings on GitHub runners; PostgreSQL 17/18 behaviour of the v6 suite; the identity of the test that crashed the backend; the share of failures that are deliberate ADR-016 divergences (needs manual reading of the roughly 160 unclassified integration assertion failures); whether the `Sequelize` member diff (48 missing) double counts the existing runtime allow-list; the results are for postgrelize at `ae7bd7b` without the in-flight work of the other session (`findByPk`, `reload`, attribute typing, `replacements` on finders), so the numbers for those causes will drop once it lands.
