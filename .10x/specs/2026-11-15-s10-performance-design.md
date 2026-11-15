# S10 — Performance: measurements and optimisation plan

Date: 2026-11-15. Status: Phase 1 (measure and design). Phase 2 (optimise) starts after the S7b PRs are on `main`.
Inputs: backlog-3 roadmap S10, `bench/`, CPU profiles of `dist` (`node --cpu-prof bench/profile.ts`).

## 1. Method

- **One scenario set, two libraries.** `bench/scenarios.ts` defines 20 cases against an injected library; `bench/orm.bench.ts` runs each case on postgrelize and on Sequelize v6 (`bench/v6.bench.ts`) in the same process, **alternating** which library goes first every round. Machine load hits both sides alike, so the **v6 / postgrelize ratio is the stable number**; absolute microseconds are not.
- **CPU time, not wall time.** Each round records `process.cpuUsage()` (user + system, includes GC threads) per op. Reported: median over rounds, plus MAD% (spread inside one run). `compare.ts` then takes the median over several result files and prints the min–max range of the ratio.
- **Stub mode** (`PGZ_BENCH_STUB=1`): `pg` is replaced by an in-memory responder (`bench/stub.ts`) that serves both libraries (promise API for `Pool#connect` clients, callback API for the `pg.Client` that v6 builds). It derives the row layout from the SQL text (`AS "Posts.id"` aliases for includes, `LIMIT`) and caches it per statement text, so responder cost per row is one object copy. **Database mode** (no flag) uses the real server, one schema per library, 10 000 seeded items, 50 authors, 500 posts, 20 tags; iterations are scaled down to a fifth.
- Large reads report **rows/s** (CPU based).
- `PGZ_BENCH_ONLY=<substring>` and `PGZ_BENCH_ROUNDS=<n>` narrow or lengthen a run. Profiling: `npm run build`, `node --cpu-prof --cpu-prof-dir=/tmp/prof bench/profile.ts "<case>" 6`, `node bench/profile-summary.ts <file>.cpuprofile` (self time per function with source-map locations).
- Baseline gate unchanged (`bench/compare.ts` against `bench/baseline.json`, +10% on the four gated cases).

### Caveat about `bench/baseline.json`

The baseline (pre-Effect, quiet machine, old responder that built every row with `Date` and `meta` objects) cannot be reproduced on the current machine: the old bench on the current `main` shows the gated cases +15 … +51% over it, and the old stub is heavier than the new one (new `findAll 100 rows` is 3–4× below the baseline number). Both effects are mixed with load from parallel sessions. **Phase 2 therefore judges changes by (a) the v6/postgrelize ratio per case, and (b) interleaved A/B runs of `main` vs the branch**, and re-baselines `bench/baseline.json` once, in the final commit, with the new stub.

## 2. Baseline: postgrelize vs Sequelize v6

Stub mode, CPU µs/op, median of three runs × 15 rounds each (`main` at c20fa81 on a loaded machine; ratio = v6 ÷ postgrelize, above 1 is faster than v6).

| Case | pgz µs | v6 µs | v6/pgz | range |
| --- | ---: | ---: | ---: | --- |
| findAll 100 rows | 69.3 | 116.4 | 1.70 | 1.59–2.00 |
| findByPk | 14.0 | 41.7 | 2.94 | 2.78–3.37 |
| count where | 7.7 | 42.6 | 5.54 | 5.07–5.84 |
| findAll include belongsTo (50) | 178.4 | 361.9 | 2.11 | 2.03–2.13 |
| findAll include hasMany (20 + posts) | 143.3 | 115.2 | **0.81** | 0.74–1.04 |
| findAll include belongsToMany (20) | 231.1 | 178.3 | **0.79** | 0.71–0.86 |
| findAndCountAll | 56.6 | 124.3 | 2.30 | 2.18–2.30 |
| where nested ops + JSON path | 38.7 | 135.3 | 3.45 | 3.35–3.49 |
| where `Op.in` 5000 values | 109.1 | 1992.6 | 18.3 | 18.2–18.5 |
| findAll 10 000 rows | 6730 | 8057 | 1.20 | 1.08–1.22 |
| findAll 10 000 rows `raw: true` | 2312 | 1015 | **0.43** | 0.42–0.44 |
| create | 25.7 | 86.2 | 3.26 | 3.03–3.35 |
| bulkCreate 100 | 461 | 1255 | 2.58 | 2.55–2.92 |
| bulkCreate 1000 | 4370 | 9899 | 2.27 | 2.22–2.33 |
| insert onConflict 50 (v6: `updateOnDuplicate`) | 230.5 | 621.7 | 2.70 | 2.52–2.74 |
| update by instance (`save`) | 23.3 | 68.6 | 2.94 | 2.26–3.40 |
| transaction + update | 15.5 | 92.2 | 5.90 | 5.68–5.96 |
| transaction with 3 queries | 46.4 | 166.0 | 3.52 | 3.48–3.67 |
| build + `toJSON` | 3.7 | 5.7 | 1.61 | 1.56–1.81 |
| model define | 16.6 | 133.0 | 7.84 | 6.45–8.53 |

Real database (PostgreSQL 17 in Docker, 5 rounds, one run, loaded machine; CPU µs/op includes the `pg` driver's own parsing, so ratios are compressed): `findAll 10 000 rows` 0.93× (112 k rows/s), `raw` 0.70× (167 k rows/s), `findAll 100 rows` 0.82×, `include hasMany` 0.97×, `include belongsTo` 1.08×; everything else 1.07–4.4× faster than v6 (`create` 1.43, `bulkCreate 100` 1.62, 3-query transaction 1.76, `Op.in` 5000 3.12, `model define` 4.39). Wall time per op in database mode is dominated by the round trip (0.2–10 ms) and is not a useful target; CPU per op is.

**Reading.** Builder-bound cases (single-row finds, counts, `where`, `create`, transactions, `Op.in`) are already ≥ 2.3× faster than v6. Row-bound cases are the weak spot: instance construction, row parsing and include assembly. That is where v6 is competitive or faster.

## 3. Flame-graph findings

Self time of the profiles of `dist` (stub responder excluded from the percentages below; it is 10–25% of each profile). Locations are in `src/`.

| Scenario | Top self-time costs |
| --- | --- |
| `findAll 100` / `10 000` | `InstanceLifecycle#assign` 12–16% (`instance-lifecycle.ts:245`); `RowMapper.parse` 11–15% (`row-mapper.ts:43`); `InstanceValues.set` 6–10% (`instance-values.ts:64`); `Model` constructor 4–6%; GC 5–8%; `ModelRegistry#owner`/`state` 2–3% |
| `findAll raw` 10 000 | `RowMapper.parse` 29% (+4.5% callback), `FindOperation#raw` 8%: raw rows still go through `Object.fromEntries(Object.entries(row).map(...))` |
| `include belongsTo/hasMany/belongsToMany` | `RowMapper.parse` 9–12%; `IncludeRows.valuesAt` 5–7% (prefix test and `slice` per key per row per include); `IncludeAssembler.mainKeys` 5–8% (parses the whole row again, three times per row); `identity` 4–6% (`JSON.stringify` per row); `#groupMain` copies the group array per row (`[...acc, row]`, O(n²) per group); `#attachThrough` 4% |
| `build` + `toJSON` | `structuredClone` 34% (`ModelInstanceValues.toJSON`); `#assign` 13%; `InstanceValues.#getAll` 9%; `InstanceState.mark` 5% |
| `findByPk`, `count where` | SQL building dominates: `quote` 9%, `ExpressionCompiler.expression` 6%, `finalize` 3–4%, `joinAll` 3%, `ownKeys` (where) 3%, `ScopeRegistry.merge` 2%, `HookRegistry.runAll` 3%, `#selectHead`/`#specColumns` 5% |
| `create`, `bulkCreate`, `update` / `save` | `SqlCompiler.finalize` 5–11% (`Set` + `Map` over all chunks, one template string per param); `joinAll` 4–5% (`flatMap` with spread per part); `InstanceValidator` (`validate`, `items`, `#attributeItems`, `#modelValidatorItems`) 8–10%; `HookRegistry.runAll` 3%; `ScopeRegistry.merge` 3%; `DmlCompiler.update` 4%; row parse + `InstanceValues.set` in `bulkCreate` read-back 9–15% |
| `transaction + update` | async machinery (`(program)`, `AsyncContextFrame`, GC) 20%; `execute` 3%: values copy `[...query.values]` and two `performance.now()` calls even with logging off |

Cross-cutting patterns behind these numbers:

1. **Per-attribute indirection.** `instance.set(values)` calls `instance.set(key, …)` per attribute, which calls `registry.definition(constructor)` (a prototype-chain walk `#owner` + `WeakMap.get`) and `attributes.get(key)` for each attribute of each row.
2. **`Object.fromEntries(Object.entries(x).map(...))`** as the default way to transform a record (row parse, `mainKeys`, `valuesAt`, `#getAll`, scope `merge`, `#assign` filter). Each allocates an entries array, one pair array per key and the result.
3. **Immutable-by-copy change tracking** (`InstanceState.mark` copies the set per change).
4. **Options normalised on every call** even when empty: `registry.scoped` + `ScopeRegistry.merge` with `Set` unions, `{ hooks: true, ...options }`, `{ ...opts, where }`.
5. **Hook dispatch** always builds a promise chain (`flatMap` + `reduce` + `then`) even when nothing is registered.
6. **SQL chunk lists**: spread/flatMap concatenation and a `Set`/`Map` pass in `finalize`; `quote` runs `replaceAll` for every identifier of every statement.
7. **`structuredClone`** for `toJSON`.

## 4. Ranked optimisations

Gain = expected change of the case's CPU time (from the self-time shares above; to be confirmed per PR). Risk covers behaviour (v6 parity) and maintenance. Order = implementation order, one theme per PR.

| # | Theme | Where | Expected gain | Risk |
| --- | --- | --- | --- | --- |
| 1 | **Compiled row parser per model.** Build once per definition (cached in the definition/runtime): arrays of `[column, attribute, parse?]`; a row is converted with a loop that writes into a plain object. If no column maps to a different name and no type has a parser, reuse the driver row as is. Same for `raw: true` and `nest`. | `row-mapper.ts`, `find-operation.ts#raw`, `written-rows.ts` | raw 10 000 rows −55% (0.43× → ≥ 1.2× v6); findAll −10…15%; include rows −8% | Low. The driver row is fresh per query; parsers and unknown-column behaviour stay identical (unit tests of `parse` with unmapped and mapped columns). |
| 2 | **Cheap instance construction.** Resolve definition once per `initialize` and pass it down (no per-attribute registry lookup); raw/persisted path assigns `dataValues` directly (no `set()` per key, no `Object.entries` + `Set` + `fromEntries` when `include` is absent); one copy for `_previousDataValues`; memoize `ModelRegistry.state` per class (scoped subclasses included). | `instance-lifecycle.ts`, `instance-values.ts`, `model-registry.ts` | findAll 100 −20…30%, findAll 10 000 −25%, `build`+`toJSON` −15%, `bulkCreate` read-back −10% | Medium. Setters, getters, `raw: false` custom `set`, include values and `isNewRecord` semantics must not change; existing lifecycle tests plus new ones for custom setters/defaults on the fast path. |
| 3 | **Include assembly.** Parse each row once; precompute per include a column plan (`path.attr` → attr) at normalisation time instead of prefix tests per row; identity key = the primary key value (single key) or a joined string, not `JSON.stringify`; push into groups instead of spreading; build `mainKeys` once. | `include-assembler.ts`, `include-rows.ts` | belongsTo −35%, hasMany −45%, belongsToMany −45% (0.8× → ≥ 1.3× v6) | Medium. De-duplication and ordering must stay identical (compat tests with includes already run on both libraries; add duplicate-key and null-join cases). |
| 4 | **`toJSON` clone.** Fast structural copy for plain data (primitives, `Date`, arrays, plain objects, `Buffer`/typed arrays); fall back to `structuredClone` for anything else, so exotic values behave as today. | `model-instance-values.ts` | `build`+`toJSON` −30% (1.6× → ≥ 2.2× v6) | Medium: must keep `structuredClone` semantics for `Date`, `Map`, nested instances (already plain after `get({plain:true})`). Property tests comparing both on generated values. |
| 5 | **Option normalisation fast paths.** `ScopeRegistry`: when the default scope is empty and no scope is selected return the call options without `merge`; replace `Object.fromEntries/Set` in `merge` with key loops; avoid the `{ hooks: true, ...options }` + `{ ...opts, where }` double spread where possible; `where-support.ownKeys` without intermediate arrays. | `scope-registry.ts`, `model-registry.ts#scoped`, `find-operation.ts`, `where-support.ts` | findByPk, count, create, update −8…12% | Low. Pure refactors with unchanged results; scope semantics covered by existing tests. |
| 6 | **Hook dispatch without hooks.** `runAll` collects hooks synchronously; when there are none it returns without creating promises; otherwise a simple `for` loop with `await` replaces `reduce` + `then`. | `hooks.ts`, `instance-lifecycle-services.ts` | small ops −3…6% (fewer microtask hops) | Low. Order and error propagation unchanged; one microtask earlier when no hooks exist (tests must not depend on it). |
| 7 | **SQL text assembly.** `finalize` in one pass (counter + parameter identity map only when a param chunk repeats); `joinAll` with a loop and a shared output array; identifier `quote` memoized per name (bounded `Map`); `execute`: no `[...values]` copy and no timing calls when logging is disabled. Output text byte-identical. | `compile.ts`, `sql-chunks.ts`, `dml-compiler.ts`, `connection-manager.ts` | bulkCreate −10%, create/update −8%, findByPk −5% | Low. Differential and unit compile tests pin the text; ADR-020 unaffected (values stay bound). |
| 8 | **Change tracking.** `InstanceState.mark` mutates a private `Set` and exposes a read-only view (copy on read only where callers keep it); `Instance.changed()` stays a fresh array. | `instance-state.ts` and its readers | `save`, `create`, `update` −3…5% (more with many attributes) | Medium: `changed` is documented as replaced-never-mutated; audit readers first. |
| 9 | **Validation fast path.** Build per-model validator plans once (attributes without validators, `allowNull` checks only); skip `#modelValidatorItems` when none are defined. | `instance-validator.ts`, `attribute-validators.ts` | update/`save`/`create` −5…8% | Medium: v6 error shape and `fields`/`skip` options must match (compat tests). |
| 10 | **Named prepared statements, opt-in.** `statementCache: { max }` option: statements of hot repeated shapes are sent with a `name` (hash of text, per-connection LRU managed by `pg`); never default, never with `pgbouncer` transaction mode (documented). | `connection-manager.ts`, options, docs, matrix row *Named prepared statements* | Real database only: −10…25% server time on small repeated queries, none in stub mode | Medium. Plan-cache invalidation errors (`cached plan must not change result type`) need retry handling; ADR required (new option, ADR-012 extension); matrix row in `docs/coverage/postgresql-features.ts` flips to `supported` with an integration test. |
| 11 | **SQL template cache** (compile once per query *shape*, bind values per call). | builders + compiler | findByPk/count −30…45% | **High, deferred.** Needs a shape key that is cheaper than compiling (the builders would have to emit it), safe invalidation on scope/association changes, and a security review (ADR-020: a cached text must never contain values). Re-evaluate after 1–7: if single-row finds are still compiler-bound, write an ADR first. |

Not worth doing: `Op.in` (18× faster than v6 already), model definition (8×), `create`/`transaction` ratios (> 3×). Pool size, `raw`, `attributes`, bulk APIs and COPY are user-side tuning and go into `docs/guide/performance.md` in Phase 2.

## 5. Targets (stub CPU, v6 ÷ postgrelize)

| Case | Now | Target |
| --- | ---: | ---: |
| findAll 100 rows | 1.7 | ≥ 2.2 |
| findAll 10 000 rows | 1.2 | ≥ 1.8 |
| findAll 10 000 rows `raw` | 0.43 | ≥ 1.2 |
| include belongsTo / hasMany / belongsToMany | 2.1 / 0.8 / 0.8 | ≥ 2.8 / ≥ 1.3 / ≥ 1.3 |
| build + `toJSON` | 1.6 | ≥ 2.2 |
| update by instance, `create`, `bulkCreate` 100 / 1000 | 2.9 / 3.3 / 2.6 / 2.3 | each ≥ +10% over now |
| every other case | ≥ 1.7 | no decrease beyond the run-to-run range |

Builder-bound cases (finds, counts, `where`, transactions) already exceed the ≥ 2× goal. Absolute gates: none of the four gated cases may be slower than `bench/baseline.json` + 10%, evaluated with A/B runs on the same machine (see the caveat in section 1); `bench/baseline.json` is replaced once, in the last commit of Phase 2, with numbers from the new stub.

## 6. Constraints

- v6 API and behaviour unchanged: hook order and arguments, error classes, instance semantics (`changed`, `previous`, getters/setters), result shapes. SQL text byte-identical for every optimisation except #10 (which adds only a statement `name`, not text).
- ADR-020 not weakened: values stay bound; the identifier quote memo only caches the quoted form of a name; nothing user-supplied is cached under a key that can collide with another statement.
- Size limits (≤ 20 lines per function, ≤ 150 per file) and the ratchet in `tests/unit/build/size-ratchet.test.ts`; no new runtime dependency; no exported free functions; hot code stays in classes; no decorators on hot paths.
- Every PR: unit/integration/compat/docs suites green, `npm run test:coverage` above thresholds, before/after table from `bench` (v6 ratio, interleaved, ≥ 3 runs) in the description, TSDoc and `docs/guide/performance.md` updated when behaviour or options change (only #10 changes the public API).
- Coordination: S7b PRs touch `src/connection`, `src/model`, `src/associations`, `src/validation`; S8b edits TSDoc across `src`. Phase 2 starts after S7b is merged and rebases on S8b before each PR.

## 7. Phase 2 order

1. PR A: #1 + #2 (rows and instances; largest share of row-bound cases).
2. PR B: #3 (includes).
3. PR C: #5 + #6 + #7 (call overhead and SQL text).
4. PR D: #4 + #8 + #9.
5. PR E: `docs/guide/performance.md` and #10 if the owner confirms the opt-in option (ADR first).
6. Final commit of the last PR: `bench/baseline.json` re-recorded; owner summary table (before/after, v6 ratio) in that PR's description.

## 8. Phase 2 results

Status: items #1–#9 done (PRs #52, #53, #55, #56); #10 (named prepared statements, opt-in) and #11 (SQL template cache) not done: #10 needs an ADR and the owner's decision, #11 stays deferred. Stub mode, CPU µs/op, median of 5 runs × 15 rounds, interleaved A/B: `main` at 87a93d3 (before) vs after.

| Case | postgrelize µs before | after | v6 ratio before | after |
| --- | ---: | ---: | ---: | ---: |
| findAll 100 rows | 72.9 | 33.4 | 1.57 | 3.29 |
| findByPk | 15.6 | 10.7 | 2.69 | 3.86 |
| count where | 8.0 | 7.0 | 4.90 | 5.09 |
| findAll include belongsTo | 169.6 | 92.3 | 2.05 | 4.16 |
| findAll include hasMany | 118.7 | 93.7 | 0.97 | 1.64 |
| findAll include belongsToMany | 193.7 | 126.0 | 0.86 | 1.54 |
| findAndCountAll | 55.5 | 34.0 | 2.11 | 4.04 |
| where nested ops + json path | 35.9 | 26.9 | 3.21 | 5.02 |
| where Op.in 5000 | 108.0 | 106.7 | 19.16 | 19.28 |
| findAll 10000 rows | 8697.4 | 3228.2 | 0.96 | 2.02 |
| findAll 10000 rows raw | 2217.3 | 939.9 | 0.43 | 1.00 |
| create | 24.3 | 18.2 | 3.01 | 4.26 |
| bulkCreate 100 | 488.7 | 299.9 | 2.18 | 4.25 |
| bulkCreate 1000 | 4829.2 | 2635.0 | 2.01 | 3.69 |
| insert onConflict 50 | 222.5 | 134.9 | 2.49 | 3.82 |
| update instance (save) | 22.5 | 15.7 | 2.82 | 3.75 |
| transaction + update | 18.0 | 13.0 | 6.21 | 7.08 |
| transaction 3 queries | 48.0 | 33.3 | 3.29 | 4.67 |
| build + toJSON | 3.8 | 2.1 | 1.60 | 3.07 |
| model define | 19.6 | 16.6 | 8.12 | 8.33 |


Targets: met for all cases except `findAll 10 000 rows raw` (target ≥ 1.2, reached parity 1.00: v6 returns the driver rows untouched, postgrelize still applies attribute mapping and type parsers in place). `bench/baseline.json` was re-recorded with the new stub (best of 5 runs, all 20 cases); the four gated cases stay gated.
