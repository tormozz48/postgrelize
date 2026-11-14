# postgrelize MVP — Design Spec

**Date:** 2026-11-14
**Status:** Draft — awaiting user review
**Feature slug:** `postgrelize-mvp`
**Related:** [PG SQL gap analysis](2026-11-14-pg-sql-gap-analysis.md)

## 1. Goal

npm package `postgrelize`: a TypeScript ORM that is a **drop-in replacement for Sequelize v6** (public API), working **only with PostgreSQL**, and exposing PostgreSQL capabilities Sequelize cannot express — first of all advanced `INSERT ... ON CONFLICT`.

"Drop-in" means: an application using Sequelize v6 with the `postgres` dialect works after replacing `import ... from 'sequelize'` with `import ... from 'postgrelize'`, and its TypeScript code still type-checks.

### Success criteria
1. Differential test suite: every covered scenario returns the same data (`toJSON()`), row counts, created/updated flags and error classes on `sequelize@6` and `postgrelize` against the same PostgreSQL.
2. Every P0 PostgreSQL extension from the gap analysis (§9) is implemented with integration tests.
3. `lint`, `format:check`, `typecheck`, `test`, `build` pass in CI on PG 16, 17 and 18.
4. Package builds to ESM + CJS with `.d.ts`; `pg` is a peer dependency.

### Non-goals (MVP)
- Other databases or dialects.
- Sequelize v7 (`@sequelize/core`) API.
- `sequelize-cli` reimplementation (QueryInterface must be compatible enough for it and umzug to run migrations).
- Byte-identical generated SQL or `logging` output vs Sequelize.
- P1/P2 features from the gap analysis (MERGE, CTE, COPY, LISTEN/NOTIFY, etc.).
- ~~npm publishing pipeline~~ — superseded: publish to GitHub Packages is in scope (ADR-006).

## 2. Key decisions

| # | Decision | Chosen | Rejected |
|---|---|---|---|
| D1 | Compatibility target | Sequelize v6 public API (reference version 6.37.x) | v7 API; "Sequelize-like" API |
| D2 | Implementation approach | Clean-room TypeScript rewrite | Fork of Sequelize v6; plugin on top of Sequelize |
| D3 | Driver | `pg` (node-postgres), peer dependency | postgres.js; pluggable adapter |
| D4 | Minimum PostgreSQL | 16; 17/18-only features gated by `server_version_num` | 14+ |
| D5 | Query parameters | Always bound (`$1..$n`); never inline escaped values | v6 style inline escaping |
| D6 | PG extensions | Additive: new options and new methods only; v6 behaviour unchanged | Changing v6 semantics |
| D7 | Compat verification | Differential tests vs `sequelize@6` devDependency + own unit/integration tests | Porting Sequelize test suite; own tests only |
| D8 | Runtime | Node.js ≥ 20, ESM + CJS | ESM only |
| D9 | Tooling | vite (library build), vitest, oxlint, oxfmt, TypeScript strict | tsup/rollup, jest, eslint/prettier |

Assumption: "linters and formatters oxlint" = `oxlint` for linting and `oxfmt` (Oxc formatter) for formatting, since oxlint itself does not format.

## 3. Architecture

Single package, layered; each layer depends only on layers below it.

```
src/
  sql/              Query AST: Select, Insert, Update, Delete, OnConflict; compiler → { text, values }
  expressions/      literal, fn, col, cast, where, json, excluded; Op symbols → AST
  data-types/       DataTypes (v6 set) + pg-types parsers/serializers
  connection/       ConnectionManager over pg.Pool; v6 option mapping (pool, dialectOptions, ssl, replication later)
  errors/           v6 error classes; SQLSTATE → error class mapping
  transaction/      managed/unmanaged transactions, isolation levels, savepoints, CLS via AsyncLocalStorage
  model/            Model: init/define, static finders/mutators, instance API, validations, timestamps
  hooks/            hook registry and runner (v6 hook names and order)
  scopes/           defaultScope, named scopes, scope merging rules (v6)
  associations/     hasOne, hasMany, belongsTo, belongsToMany; include compiler; accessor mixins
  query-interface/  DDL methods (v6 QueryInterface surface) + sync()
  sequelize.ts      Sequelize class
  index.ts          public exports (same names as v6)
```

### Request flow
`Model.findAll(options)` → apply scopes / paranoid / defaults → `beforeFind*` hooks → build AST → compile to `{ text, values }` → execute via `pg` (in transaction client if any) → parse rows with DataTypes → build instances (+ nested include) → `afterFind` hooks → return.

Writes follow the same path; errors from `pg` are mapped to v6 error classes by SQLSTATE before being thrown.

### Unit contracts
- **sql compiler:** pure function `compile(ast): { text: string; values: unknown[] }`. No I/O. Identifiers always quoted with `"`. Fully unit-testable by snapshots.
- **expressions:** builders return AST nodes; `Op` symbols are the same objects as exported from `postgrelize` (`Op.eq` etc.).
- **connection:** `acquire()/release()`, `query(text, values, { client? })`. Only this layer imports `pg`.
- **model:** never builds SQL strings; only AST.
- **errors:** pure mapping `mapPgError(err): BaseError`.

## 4. Public API surface (MVP)

Exports matching v6: `Sequelize`, `Model`, `DataTypes` (also static on `Sequelize`), `Op`, `Transaction`, `QueryTypes`, `Deferrable`, `IndexHints` (no-op for PG), `Utils` subset, `fn`, `col`, `literal`, `where`, `cast`, `json`, `and`, `or`, all v6 error classes (`BaseError`, `ValidationError`, `UniqueConstraintError`, `ForeignKeyConstraintError`, `ExclusionConstraintError`, `DatabaseError`, `TimeoutError`, `ConnectionError` family, `EmptyResultError`, `OptimisticLockError`, …), and TS types (`InferAttributes`, `InferCreationAttributes`, `CreationOptional`, `ForeignKey`, `NonAttribute`, `ModelStatic`, `ModelDefined`, `Optional`, `WhereOptions`, `FindOptions`, …).

Model statics: `init`, `findAll`, `findOne`, `findByPk`, `findOrCreate`, `findOrBuild`, `findCreateFind`, `findAndCountAll`, `count`, `max`, `min`, `sum`, `aggregate`, `create`, `bulkCreate`, `upsert`, `update`, `destroy`, `restore`, `increment`, `decrement`, `truncate`, `build`, `bulkBuild`, `sync`, `drop`, `scope`, `unscoped`, `addScope`, `addHook`/`removeHook`/`hasHook` + named hook methods, `getAttributes`, `primaryKeyAttribute(s)`, association statics.

Instance: `get`, `set`, `setDataValue`, `getDataValue`, `changed`, `previous`, `save`, `update`, `reload`, `destroy`, `restore`, `increment`, `decrement`, `validate`, `equals`, `toJSON`, `isNewRecord`, `dataValues`, `_previousDataValues`, association accessors.

Sequelize instance: constructor (URI or `(database, username, password, options)`), `define`, `model`, `isDefined`, `models`, `query` (replacements, bind, `type`, `model`, `mapToModel`, `plain`, `raw`), `transaction`, `authenticate`, `close`, `sync`, `drop`, `getQueryInterface`, `fn/col/literal/where/cast/json/and/or`, `escape`, `addHook`, `options`, `config`, `getDialect()` (returns `'postgres'`), `databaseVersion`.

## 5. PostgreSQL extensions (P0)

### 5.1 Advanced ON CONFLICT (M2)
New option `onConflict` accepted by `create`, `bulkCreate`, `upsert`, and new static `Model.insert(values | values[], options)` (no per-row instance hooks unless `individualHooks: true`).

```ts
type OnConflict<M> = {
  target:
    | Array<keyof Attributes<M> | Literal | Fn>            // columns or index expressions
    | { columns: Array<keyof Attributes<M> | Literal | Fn>; where?: WhereOptions<M> } // partial index
    | { constraint: string };                              // ON CONSTRAINT
  action:
    | 'nothing'
    | {
        update:
          | Array<keyof Attributes<M>>                     // c = EXCLUDED.c
          | Partial<Record<keyof Attributes<M>, unknown | Literal | Fn | Col | Excluded>>;
        where?: WhereOptions<M>;                           // DO UPDATE ... WHERE
      };
};
```

- Index expressions with `COLLATE` / opclass in `target` are passed as `literal(...)`.
- `excluded('col')` → `EXCLUDED."col"`. Using it outside `onConflict.action` throws at build time.
- `col('x')` inside `action` refers to the existing target row; the insert uses table alias = model name so references are unambiguous.
- `target` required when `action` is an update (PG rule) — validated before the query.
- Unknown attribute names → `Error` before the query. Attribute names are mapped to `field` names.
- `updatedAt` is added to the update set automatically when the model has timestamps, unless explicitly set. (Note: v6 `updateOnDuplicate` does *not* do this; v6 options keep v6 behaviour.)
- Result: instances from `RETURNING *`, plus `RETURNING (xmax = 0) AS "__pgz_inserted"`; the flag is removed from `dataValues` and exposed as `instance.wasInserted: boolean` (non-attribute). Skipped rows (DO NOTHING / WHERE false) are not returned.
- `upsert()` with `onConflict` returns `[instance, created: boolean]` using the same flag.
- v6 options (`updateOnDuplicate`, `conflictAttributes`, `conflictWhere`, `ignoreDuplicates`, `conflictFields`) keep v6 behaviour; combining any of them with `onConflict` throws.

### 5.2 Other P0 extensions
| Extension | API | Milestone |
|---|---|---|
| `NOWAIT` | `findAll({ lock: true, noWait: true })` (`skipLocked` and `noWait` mutually exclusive) | M1 |
| null-safe compare | `Op.isDistinctFrom`, `Op.isNotDistinctFrom` | M1 |
| jsonb key exists | `Op.hasKey` (`?`), `Op.hasAnyKeys` (`?|`), `Op.hasAllKeys` (`?&`) | M1 |
| array bind for IN | `Op.in` / `Op.notIn` with > 100 values (and always when `options.inAsAny` true) compiles to `= ANY($n::type[])` / `<> ALL(...)`; result-equivalent to v6 | M1 |
| DELETE RETURNING | `destroy({ where, returning: true })` → returns deleted instances instead of count (v6 has no `returning` on destroy, so additive) | M1 |
| `UNIQUE NULLS NOT DISTINCT` | `unique: { name?, nullsNotDistinct: true }` on attribute; `addIndex({ unique: true, nullsNotDistinct: true })` | M5 |

## 6. Milestones

| M | Scope | Done when |
|---|---|---|
| M0 | Tooling: package.json, tsconfig, vite lib build, vitest projects, oxlint + oxfmt, docker-compose PG16, GitHub Actions (PG16/17/18) | empty `src/index.ts` builds; all scripts green |
| M1 | Core: Sequelize class, connection, DataTypes, errors, SQL AST + compiler, where/Op, Model init/define, CRUD statics + instance API, transactions + CLS, raw `query`, P0 M1 extensions | unit + integration + differential CRUD/where/transaction suites green |
| M2 | ON CONFLICT (§5.1), v6 upsert/bulkCreate conflict options | differential v6 upsert suite + extension integration suite green |
| M3 | Hooks, scopes, paranoid, timestamps, validations, version (optimistic locking) | differential suites green |
| M4 | Associations + include (nested, required, where on include, separate, through, `findAndCountAll` with include + limit subquery) | differential suites green |
| M5 | QueryInterface + `sync` (alter/force) + `UNIQUE NULLS NOT DISTINCT` | umzug-style migration smoke test green; differential DDL suite (describeTable comparison) green |

This implementation cycle covers **M0–M2**. M3–M5 each get their own design/plan cycle reusing this spec.

## 7. Error handling
- All driver errors are mapped by SQLSTATE: `23505` → `UniqueConstraintError` (with `fields` parsed from `detail`), `23503` → `ForeignKeyConstraintError`, `23P01` → `ExclusionConstraintError`, `57014` → `TimeoutError`, `40001`/`40P01` → `DatabaseError` with `parent`/`original` set like v6, connection errors → v6 `Connection*Error` classes. Unmapped → `DatabaseError`.
- Every thrown DB error keeps v6 fields: `name`, `message`, `parent`, `original`, `sql`, `parameters`.
- Option validation errors (unknown attribute, invalid `onConflict`) throw plain `Error` before any query, as v6 does for invalid options.
- Failed managed transactions roll back and rethrow the original error.

## 8. Testing strategy
- **unit** (`tests/unit`, no DB): compiler snapshots, Op → AST, DataTypes parse/serialize, error mapping, option validation.
- **integration** (`tests/integration`, PG via `docker-compose.yml`, `PGZ_TEST_URL`): each test file creates and drops its own schema; files run in parallel.
- **compat** (`tests/compat`): helper `runBoth(scenario)` executes a scenario `(lib) => Promise<unknown>` once with `sequelize@6` and once with `postgrelize`, each in a fresh schema, and asserts deep equality of normalized results (instances → `toJSON()`, errors → `{ name, fields }`). Timestamps and generated ids are normalized.
- Until M5, test tables are created with raw SQL.
- Coverage target for M0–M2: ≥ 85% lines on `src/sql`, `src/expressions`, `src/model`.

## 9. Tooling
- **Build:** `vite build` library mode, entries → `dist/index.js` (ESM) + `dist/index.cjs` (CJS); `vite-plugin-dts` for types; `pg` external. `package.json` `exports` with `import`/`require`/`types`; `sideEffects: false`.
- **TypeScript:** `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes: false` (v6 type compat), `module`/`moduleResolution: bundler` for source; `typecheck` = `tsc --noEmit`.
- **Scripts:** `lint` (oxlint), `format` / `format:check` (oxfmt), `typecheck`, `test`, `test:unit`, `test:integration`, `test:compat`, `build`, `db:up` / `db:down`.
- **CI:** GitHub Actions: install → lint → format:check → typecheck → unit → integration + compat (matrix: postgres:16, postgres:17, postgres:18 service containers) → build.

## 10. Risks
| Risk | Mitigation |
|---|---|
| v6 API surface is large and loosely specified; hidden behaviours (e.g. `findAndCountAll` + include count, `raw: true` nesting) | Differential tests per behaviour; read v6 source when in doubt |
| v6 TS types are complex; drop-in type compat may break user code | Port type definitions shape-for-shape; add a `tests/types` compile check with v6 example models |
| Bound parameters change behaviour vs inlined values (type inference, e.g. `$1` untyped in `fn` args) | Add explicit casts from DataTypes when compiling; differential tests cover `fn`/`literal` cases |
| `xmax = 0` trick is an implementation detail of PG | Documented PG behaviour widely used; covered by integration tests on PG16/17/18 in CI matrix |
| oxfmt maturity | If blocking, fall back decision goes to user (not silently to prettier) |
