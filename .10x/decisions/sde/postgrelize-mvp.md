# SDE — postgrelize-mvp

## M0 — Tooling (T01–T04) — done 2026-11-14
Built:
- `package.json` `@tormozz48/postgrelize`, ESM+CJS exports, `pg` peer, scripts (build, lint, format, typecheck, test*, docs, db:up/down).
- TypeScript 6.0.3 strict (`tsconfig.json` for typecheck incl. tests; `tsconfig.build.json` for d.ts).
- oxlint 1.93 (`.oxlintrc.json`: correctness+suspicious errors, no-explicit-any, explicit-module-boundary-types on src, import/no-cycle, no default exports), oxfmt 0.78.0 exact (`.oxfmtrc.json`).
- vite 8 library build (`vite.config.ts`, rolldown, externals = peer deps + node builtins) + vite-plugin-dts.
- vitest 5 projects: unit, build (dist smoke test), integration, compat; DB global setup with reachability check; `withSchema` helper (random schema per test).
- `docker-compose.yml` PG (default 16).
- TypeDoc (`typedoc.json`, fails on undocumented exports) → `docs-site/`.
- Workflows: ci.yml, release.yml, docs.yml.

Deviations from plan:
- Added publish to GitHub Packages (ADR-006) and TypeDoc/Pages (ADR-007) per user requests.
- `npm test` excludes `build` project (needs dist); run `test:build` after build.
- `runBoth` compat helper deferred to T15 (YAGNI until first compat scenario).

Tech debt:
- CJS consumers get `index.d.ts` (ESM-flavoured types) for `require`; evaluate `index.d.cts` with `@arethetypeswrong/cli` once real exports exist (T10).
- CI workflows not yet executed on GitHub (branch not pushed).

## M1 — Core (T05–T15) — done 2026-11-14
Built (`src/`):
- `sql/` immutable AST + compiler (`compile`, `finalize` chunk → `$n` numbering, single pass, no inlined values).
- `expressions/` `Op` (`Symbol.for(name)` — interchangeable with v6), `literal/fn/col/cast/json/where/excluded`.
- `where/` v6 where compiler: all v6 ops, nested JSON paths with v6 casts, `$nested$`, `::cast`, Op.any/all/values, PG ops (isDistinctFrom, hasKey/hasAnyKeys/hasAllKeys), IN → `= ANY($n)` above threshold (default 100, `inAsAnyThreshold`).
- `data-types/` v6 DataTypes (callable/bare), JSON(B) serialize, RANGE parse/serialize (v6 bound objects), ARRAY element serialize.
- `errors/` v6 error classes (names `Sequelize*`), SQLSTATE + connection code mapping.
- `connection/` option parsing (URI / args / options), pg pool (`types` override: DATE as string), executor with logging (`Executing (<tx>|default): sql`), timezone via `-c TimeZone`.
- `query/raw-query.ts` replacements/bind → bound params with SQL tokenizer (strings, identifiers, comments, dollar quotes, casts, `?|`/`?&`).
- `transaction/` Transaction (savepoints, isolation, readOnly, afterCommit), managed runner, AsyncLocalStorage CLS (`Sequelize.useCLS()`).
- `model/` definition normalization (v6 defaults: auto `id`, timestamps, `inflection` pluralize/underscore), query builders, row parser, `Model` class shell, v6-compatible public types.
- `sequelize.ts` Sequelize class; `index.ts` public exports (all TSDoc'd, TypeDoc strict).

Tests: unit 64, integration 22 (incl. extensions, CLS, savepoints, NOWAIT/SKIP LOCKED, connection errors), compat 16 differential scenarios vs sequelize@6.37.8, `tests/types/model-types.ts` compile-time checks. Coverage ~92% lines overall, model.ts ~80%.

Deviations:
- Added runtime dependency `inflection@~1.13.4` (same as v6) for table-name parity.
- `Model<TAttributes extends object>`; `AnyModel = Model<any, any>` (lint-disabled, v6 compat), InferAttributes uses key remapping (as v6) — excluding Model base keys first avoids infinite instantiation.
- TypeDoc `validation.notExported` disabled (internal helper types); `notDocumented` still enforced. Inline object types replaced by named, documented types.
- Hooks, validations (incl. `allowNull` ValidationError), scopes, paranoid deferred to M3 as planned; NOT NULL violations currently surface as `DatabaseError` (v6 raises `ValidationError` before the query).
- `UUIDV1` not implemented (no dependency on `uuid`); `Deferrable` deferred to M5.

Tech debt:
- CJS consumers get ESM-flavoured `index.d.ts` (check with @arethetypeswrong in M2).
- `count({ group })` returns array typed as `number` (v6 overload shape) — add overload.
- `Model` static getters (`tableName`, `rawAttributes`) are getters, v6 has plain properties (assignment not supported).
- model.ts coverage 80% — more instance-path tests in M3.

## M2 — ON CONFLICT (T16–T19) — done 2026-11-14
Built:
- `src/model/on-conflict.ts`: `OnConflictOptions` (targets: attribute list, `{ columns, where }` partial index, `{ constraint }`, expression index via `fn`/`literal`; action `'nothing'` | `{ update: attrs[] | map, where }`), `buildOnConflict` (validates before any query), `insertedFlagColumn` (`(xmax = 0) AS "__pgz_inserted"`).
- `Model.insert()` (returns only written rows, `wasInserted` per instance), `onConflict` in `create` / `bulkCreate` / `upsert`.
- v6 options: `upsert` (target = `conflictFields` | unique key of an updated attribute | PK; returns `[instance, null]`), `bulkCreate` `updateOnDuplicate` / `conflictAttributes` / `conflictWhere` / `ignoreDuplicates` (rows mapped onto instances by index, like v6).
- `excluded()` allowed only in onConflict (runtime guard via `WhereContext.allowExcluded`).
- `ModelDefinition.uniqueKeys` (v6 naming `${table}_${attr}_unique`).

Deviations:
- Spec §5.1 said auto-adding `updatedAt` "matches v6 updateOnDuplicate" — it does not: v6 never adds it for `updateOnDuplicate`. Implemented: v6 options unchanged (no auto-add); `onConflict` update auto-adds `updatedAt = EXCLUDED.updatedAt` unless set explicitly.
- `create` with `onConflict` that skips the row returns the unsaved instance (`isNewRecord: true`, `wasInserted: false`).
- `wasInserted` stored in a module WeakMap (no extra instance state), exposed as a getter; added to `ModelBase` so it is not inferred as an attribute.

Security fixes (from Phase 5 review):
- `order` given as a plain string threw in v6 but was inlined here → now throws like v6.
- `attr::type` cast types validated against v6 allowlist (+ `uuid`).
- `where(attr, '<comparator>', value)` comparator validated.
- `fn()` names and `cast()` types validated by pattern.

## M3 — Lifecycle (T20–T25) — done 2026-11-14
Built: `src/hooks/hooks.ts` (immutable registry, proxies, runner), `src/validation/` (validator.js + v6 extras, instance validator port, Standard Schema), `src/model/scopes.ts` (v6 merge rules), `src/model/lifecycle.ts` (hook runner, validateWithHooks, paranoid where), `src/model/state.ts` (per-model state incl. hooks/scopes/validators, scoped subclasses share state), `model.ts` wiring in all CRUD paths, `Sequelize.addHook/removeHook/hasHook`, `beforeConnect` via pg password function.

Tests: compat +14 scenarios (hook order, validation messages/items, AggregateError, scopes, paranoid, version), integration +5 (zod schema, global/define hooks, hook mutation, beforeConnect, whereMergeStrategy), unit +6, type checks for hooks/scopes/restore.

Deviations:
- Model-level Standard Schema option is `validationSchema` (v6 `schema` = PostgreSQL schema).
- `hasHook` returns `false` (v6: `undefined`) when a type was never registered.
- `bulkCreate({ individualHooks: true })` saves rows sequentially (v6: `Promise.all`) — deterministic ids.
- Connection/sync/query/define hooks are accepted but only `beforeConnect` runs (password only).
- Static `update` applies the paranoid filter unless `paranoid: false`.

Tech debt:
- model.ts still ~1.5k lines (mostly TSDoc); further split per operation in M4.
- `beforeConnect` can only change the password (pg limitation via password function).

## M4 — Associations (T26–T32) — done 2026-11-14
Built: `src/associations/types.ts`, `associate.ts` (definitions, v6 naming, FK injection via definition rebuild, implicit through model through `runtime.defineModel`, accessor mixins), `include.ts` (normalization, joins/aliases, sub-query, EXISTS filters for required includes, row-tree assembly, raw parsing, separate loading). `ModelState` keeps `init` input and associations; `normalizeDefinition` accepts association attributes (appended after timestamps like v6).

Tests: compat +11 (definitions/accessor names, include variants, where/required/attributes/through, order + limit sub-query, separate, raw/nest, count/findAndCountAll, all:true, eager loading errors, accessors for all four types); type checks for associations/include.

Deviations / limits:
- Rows without selected primary keys are de-duplicated by all selected values.
- `required` include + `limit` uses `EXISTS (...)` in the sub-query (v6: `(SELECT fk ... LIMIT 1) IS NOT NULL`) — same rows.
- Default scopes of included models are not applied (v6 applies them) — tech debt.
- belongsToMany join uses two flat joins (through, then target) instead of v6's parenthesized nested join — same results for tested cases.
- Not implemented: nested create via `include` in `create`/`bulkCreate`, `include` in `update`/`destroy`, association hooks, `LATERAL`/json strategy (P1).

## M5 — QueryInterface & sync (T33–T37) — done 2026-11-14
Built: `src/ddl/literals.ts` (escapeLiteral, inlineValues, table refs), `src/ddl/ddl.ts` (columns, enums, create/alter, indexes, constraints, Deferrable), `src/query-interface/query-interface.ts`, `src/query-interface/sync.ts` (sync/drop, alter diff, dependency order); association FKs with v6 referential defaults; model `indexes`/`comment` options.

Tests: compat +4 (sync create incl. describeTable/indexes/FKs, force/alter, drop order, QI operations), integration +3 (NULLS NOT DISTINCT, FK cascades, umzug-style migration), unit +5 (literals, DDL builders, injection).

Deviations:
- `showAllTables` / `describeTable` / `tableExists` default to `current_schema()`; v6 hard-codes `public` (breaks with `search_path`).
- `renameTable` with a schema-qualified target emits valid SQL (v6 emits invalid `RENAME TO "schema"."table"`).
- Indexes are created with `IF NOT EXISTS` instead of v6's `showIndex` diff.
- `alter` does not compare/drop indexes or constraints other than adding missing FKs.
- Not implemented: `createFunction`/`createTrigger`, `showIndex`, `getForeignKeysForTables`, `upsert` on QueryInterface, enum value migration on `alter` (v6 `ALTER TYPE ADD VALUE`).

## P1-A — Query power — done 2026-11-14
Built: expression kinds `subquery` (thunk built by `Model.subquery`, no model import in the where compiler), `exists`, `over`, `tuple`; AST `OverNode`, `SelectNode.distinctOn`; `buildSelect` alias override; `src/sql/order.ts` shared direction allowlist.
Tests: integration +5 (IN subquery, scalar subquery, EXISTS/NOT EXISTS correlated, DISTINCT ON, window ranking, keyset row comparison, direction validation in windows), unit +1.

## P1-B — Write power — done 2026-11-14
Built: AST `FromItem`, `UpdateNode.from`, `DeleteNode.using`, `InsertNode.select`, `MergeNode` (+ compiler); `src/model/write-power.ts` (join sources, MERGE builder with typed VALUES sources, timestamps via `now()`); `Model.insertFrom`, `Model.merge`, `update({ from })`, `destroy({ using })`; `runtime.serverVersion()` (cached `server_version_num`).
Tests: integration +6 (update from, delete using, insertFrom ± onConflict, merge rows/subquery, merge returning + NOT MATCHED BY SOURCE on 17+ / clear error on 16, option validation); verified locally on PG16 and PG17.
Limits: `individualHooks` with `from` rejected; no hooks/validation for merge/insertFrom (bulk SQL operations).

## P1-C — Connection power — done 2026-11-14
Built: `src/connection/copy.ts` (COPY text encoder + `CopyFromStdin` pg submittable), `src/connection/notifications.ts` (dedicated LISTEN client), ConnectionManager `copyFrom`/`dedicated`, Transaction `settings`/`advisoryLock`/`tryAdvisoryLock`, Sequelize `listen`/`notify`/`withAdvisoryLock`, Model `findEach`/`copyFrom`, runtime `copyFrom`/`beginTransaction`.
Tests: integration +6 (COPY arrays/async iterables/escaping/errors/rollback + pool health after failure, findEach batching and early exit, LISTEN/NOTIFY incl. transactional notify and unlisten, SET LOCAL scope, advisory lock exclusion), unit +2 (COPY encoding).
Bugs found: pg detaches the active query on ErrorResponse → COPY must report errors from `handleError` and stop pumping before the client is released (else hang / protocol mix-up).
Deviations: `copyTo` not implemented (needs type OIDs for text parsing; YAGNI). findEach rejects joined includes; no hooks for findEach/copyFrom.
