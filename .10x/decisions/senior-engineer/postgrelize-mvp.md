# Senior Engineer — postgrelize-mvp implementation approach

## Versions (checked 2026-11-14)
vite 8.3.x, vitest 5.1.x, @vitest/coverage-v8 5.1.x, oxlint 1.93.x, oxfmt 0.78.0 (exact), vite-plugin-dts 5.1.x, typescript 6.0.x (not 7: dts plugin needs TS JS API), pg ^8.23 (peer + dev), @types/pg, sequelize 6.37.8 (dev, compat oracle). Node ≥ 20.

## Per task
- **T01:** `"type": "module"`; `exports` → `./dist/index.js` (import), `./dist/index.cjs` (require), `./dist/index.d.ts`; `files: ["dist"]`; `engines.node >=20`; `peerDependencies.pg ^8`. `tsconfig.json` (src+tests, noEmit) — strict flags per staff standards.
- **T02:** `vite.config.ts` `build.lib` entry `src/index.ts`, formats `es`,`cjs`, `rollupOptions.external: ['pg', /^node:/]`, target node20; dts plugin `rollupTypes: false`. Smoke test: import built ESM and CJS in a vitest test after build (`tests/build`).
- **T03:** `vitest.config.ts` with `test.projects`: unit (`tests/unit/**`), integration and compat (`tests/integration/**`, `tests/compat/**`, `globalSetup` checks DB reachable, env `PGZ_TEST_URL` default `postgres://postgres:postgres@localhost:54329/postgrelize`). Helper `withSchema(fn)` creates `pgz_<random>` schema and drops after. `docker-compose.yml` postgres:16 on port 54329, healthcheck.
- **T05:** AST as readonly discriminated unions (`kind`). `compile` threads a pure param accumulator (`{ values }` returned, not mutated globally) — implement as fold returning `[sql, values]` with offset. `quoteIdent` doubles `"`.
- **T06:** builders return AST; `Op` = frozen object of `Symbol.for('postgrelize.op.<name>')`… must equal v6 `Op` semantics but not identity — users import Op from postgrelize.
- **T07:** `whereToAst(where, ctx)` recursive pure function; operator table `Record<symbol, (lhs, rhs) => Ast>` (open/closed: add Op = add entry). IN → `= ANY($n)` when list > 100 or `inAsAny`.
- **T08:** DataType = factory functions returning `{ key, toSql(), parse?, serialize?, validate? }`; keep v6 call shapes (`DataTypes.STRING(255)`, `DataTypes.STRING`, `.UNSIGNED` no-op chainers) via callable objects. pg type parsers: BIGINT/NUMERIC as string (v6 behaviour), DATE → Date, DATEONLY string.
- **T09:** error classes mirror v6 constructors/fields; `mapPgError(err, { sql, parameters })` table by SQLSTATE; UniqueConstraintError fields parsed from `detail` `Key (a, b)=(x, y)`.
- **T10:** `createPool(options)` maps v6 options; `createExecutor(pool)` returns `(q, { client? }) => ...` with try/finally release and error mapping. `Sequelize` class holds config + pool + registry only.
- **T11:** `runInTransaction(pool, opts, fn)`; CLS via `AsyncLocalStorage` only when `Sequelize.useCLS()` called (v6 API) — shim accepting a namespace-like object.
- **T12:** `normalizeDefinition(attributes, options)` → frozen `ModelDefinition`; `Model.init` stores it in a WeakMap keyed by model class (no static mutable fields beyond v6-visible ones like `rawAttributes`, `tableName`, `sequelize`).
- **T13–T14:** each static = `normalize → build → compile → execute → mapRows → instantiate`. Shared pipeline function `runQuery(model, ast, opts)`.
- **T15:** scenarios as data `{ name, setupSql, run(lib) }`; normalize results.
- **T16–T18:** `normalizeOnConflict(def, opts)` validates and maps attrs→fields, returns AST node; insert builder appends `RETURNING *, (xmax = 0) AS "__pgz_inserted"` when onConflict or v6 upsert; rows mapper strips flag into instance `wasInserted`.

## Tricky parts
- Param typing in `fn()`/`cast()` args: emit `$n::<type>` when value bound against a known attribute type.
- v6 `upsert` return `[instance, created]` on PG — verify via differential test (v6 returns `created` = null or boolean depending on version).
- `bulkCreate` with `returning` + `ignoreDuplicates`: skipped rows absent — match v6 instance list behaviour exactly (v6 returns all built instances).

## M3 approach
- Hooks: `type HookFn = (...args) => unknown | Promise<unknown>`; registry `ReadonlyMap<HookType, readonly Hook[]>` kept in model state (WeakMap) — `addHook` replaces the map. Run: model hooks then Sequelize-level (v6 runs permanent sequelize hooks for all models). Clone options shallowly at public entry points before hooks see them.
- Validation: port v6 `instance-validator` semantics; validator.js call `validator[name](String(value), ...args)`; v6 extras (`is`, `not`, `isIn`, `notIn`, `len`, `notEmpty`, `min`, `max`, `isImmutable`) implemented locally. Standard Schema: `await schema['~standard'].validate(value)`; `issues[].path` → item path.
- Scopes: `Model.scope()` creates `class extends this` with `Symbol` state for selected scopes; `stateOf` must resolve scoped subclasses to base model state (walk prototype chain).
- Paranoid in `buildSelect`/`buildCount`/`buildAggregate`/`buildUpdate` via an extra where AND-ed; `destroy` → update.
- Version: save update path adds where + set `version = version + 1`, then checks `rowCount`.
