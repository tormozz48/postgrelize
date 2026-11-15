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

## P1-D — Schema power — done 2026-11-14
Built: attribute `identity` / `generated`; DDL rendering (identity type, `GENERATED ALWAYS AS (...) STORED|VIRTUAL`, no DEFAULT for generated), insert/update skip generated attributes, `OVERRIDING` in INSERT AST/compiler and create/bulkCreate/insert options, `DataTypes.INTERVAL` with raw server text (OID 1186 parser override), `addEnumValuesSql` in `sync({ alter })` (identity/generated columns not altered).
Tests: integration +2 (identity always + overriding, generated recompute on update, INTERVAL, enum values added by alter).

## Backlog — CTE + copyTo — done 2026-11-14
Built: AST `WithClause`/`CteNode`/`UnionNode`/`SelectNode.extraFrom` (+ compiler); `src/model/cte.ts` (with/source/from options, source definition with attribute-named columns); `CopyToStdout` submittable with pause/resume backpressure and discard-on-early-exit; `ConnectionManager.copyTo`; `Model.copyTo` with validated COPY options and ADR-013 literal inlining.
Tests: integration +4 (recursive tree walk returning instances, materialized CTE in count + IN subquery, extra FROM self-join, CSV export incl. quoting/NULL, option validation, 5k-row slow consumer integrity, early exit, error + pool health), unit +1 (CTE compile).
Bugs found: pg-protocol reuses the socket buffer → CopyData chunks must be copied before queueing (data corruption with slow consumers).
Note: `extraFrom` is rendered after joins so join conditions keep referencing the main table.

## Backlog — read replicas + nested creation — done 2026-11-14
Built: `ReplicationOptions`/`ReplicationMember`, `replicationPoolConfigs` (members merged over top-level options), reader pools with round-robin in ConnectionManager (`route: 'read'`), Sequelize routes SELECT/model reads to readers unless in a transaction or `useMaster: true` (ADR-014); nested creation: `build`/`create`/`bulkCreate` with `include` build nested instances (through values as through-model instances), `save()` saves belongsTo parents first, then hasOne/hasMany/belongsToMany children (junction rows via through model `create`) sequentially in the same transaction options.
Tests: compat +3 (nested create of all four association kinds incl. nested levels and through values, build+save, bulkCreate with include), integration +3 (reader role routing, `useMaster`/transaction on writer, round-robin).
Bugs found: v6 keeps nested through values as a through-model instance (null PKs in JSON) — matched.

## Backlog — RETURNING old values + include scopes — done 2026-11-14
Built: AST `returningOld` alias on insert/update/merge (`RETURNING WITH (OLD AS "__pgz_old") ...`), `withReturningOld` builder, `returningOld` option on `update` / `insert` (+ `create`-free paths) / `insertFrom` / `merge`, `instance.oldValues` (null when no previous row, detected by NULL primary key), PG18 version gate; include normalization injects the scope of the included model (scoped class or target default scope) with v6 merge rules before computing `required`; scoped classes resolve as association targets; separate includes select all stored attributes when none given (v6 parity).
Tests: compat +7 (default scope on hasMany/belongsTo includes incl. required side effect, include where merge, `unscoped()`/named scope as include model, nested + separate, count), integration +2 (returningOld for update/upsert/insertFrom/merge on 18, version error below 18, missing `returning`). Verified locally on PG16 and PG18 (temporary container).

## Backlog 2 / S2a — v6 parity regressions — done 2026-11-14
Fixed (found by the Sequelize issue review, `.10x/reviews/2026-11-14-sequelize-issues.md`):
- included associations / junction rows exposed as instance properties (`defineAssociationAccessor`); the differential helper now reads included associations through instance properties, so the suite catches this class of gap (15 scenarios failed without the fix);
- #13734 upsert / updateOnDuplicate conflict targets use unique `indexes` with v6 rules (`conflict.ts`);
- #10419 user-declared `createdAt`/`updatedAt` attributes keep their definition;
- #17486 upsert keeps supplied `updatedAt` (also for attributes mapped to another field — v6 overwrites those: divergence);
- #15466/#11100 ARRAY(ENUM) parsed (`src/data-types/array-literal.ts`, unknown-OID arrays arrive as text);
- #15522 sync with FK cycles: back-references created after all tables (`deferredReferences`); v6 silently creates no FK at all — divergence;
- #17118 `addColumn` and `sync({ alter })` added columns emit `COMMENT ON COLUMN`;
- #9040 `order: ['json.path']` orders by `#>` jsonb value (numbers numerically; v6 orders as text — divergence).
Tests: compat +3 (`issue-parity`), integration +5 (`sequelize-issues`), unit +1 (array literal). 222 green.

## Backlog 2 / S2b — inherited v6 bugs fixed by default (ADR-016) — done 2026-11-14
- where: JSON path bound as `text[]` param (#18617), jsonb operators on nested paths use `#>` and JSON operands (#5173), `{ [Op.any]: [...] }` shorthand (#16043).
- writes: `upsert({ overriding })` (#14497), partial unique index predicate in v6 upsert target (#12595), identity-always columns excluded from `DO UPDATE SET`, `bulkCreate({ ignoreDuplicates })` aligns RETURNING rows with inputs.
- DDL: `describeTable` parses quoted literal defaults (#16787), alter keeps `autoIncrement` sequence default (#13167), `sync`/`drop` `schema` option incl. references in that schema (#18423).
- include: limit subquery exposes join keys (#18256), `$include.attr$` in top-level where disables the limit subquery (#12971).
- nested-create differential test made independent of sibling insert order (v6 saves siblings in parallel; was a flake).
- Public page `docs/sequelize-issues.md` (moves into the VitePress site in S3); README links it.
Not fixed (documented): #16929, #11968, #11288, #12948, #11146 duplicate alias variant.
Tests: integration +11 (`sequelize-issues`), unit expectations for JSON path params updated.

## Backlog 2 / S3 — VitePress documentation site — done 2026-11-15
- VitePress 1.6.4 site in `docs/` (base `/postgrelize/`, local search); API reference generated by TypeDoc into `docs/api` (typedoc-plugin-markdown + typedoc-vitepress-theme, `notDocumented` validation kept); Pages workflow publishes `docs/.vitepress/dist` + `/coverage/`.
- 12 guide pages; 14 example files in `docs/examples/` shown via snippet regions, type-checked (tsconfig `paths` maps `postgrelize`) and executed against PostgreSQL by the `docs` vitest project (version-gated examples via `minimumServerVersion`; verified on PG16 and PG18).
- Found while writing examples (follow-up fixes): `limit` on `separate: true` includes is ignored (v6 applies a per-parent limit); `findEach` accepts separate includes but never loads them.
- Doc gaps recorded on pages: `sequelize.query()` returns `unknown`, no association mixin types exported, non-lifecycle hooks (except `beforeConnect`) never run.

### Follow-up fixes (2026-11-15)
- separate include `limit` applied per parent (v6 parity; filtered after the per-association query, no SQL-side grouped limit yet).
- `findEach` loads `separate: true` includes per batch inside the cursor transaction.
Tests: compat +1 (per-parent limit vs v6), integration +1 (findEach separate include).

## Backlog 2 / S4 — Effect core (step 1–3) — done 2026-11-15
- `effect` 4.1.4 runtime dependency (ADR-017). Connection manager exposes `effects` (execute / client / acquire / copyFrom / dedicated / close as Effect programs); Promise methods are `Effect.runPromise` wrappers. Hot path flattened to one `acquireUseRelease` around one `tryPromise` (Effect cost is per node).
- Transactions: `beginEffect` / `commitEffect` / `rollbackEffect`, `managedTransaction` (rollback on failure and interruption via `Exit`); Promise API unchanged.
- Bugs fixed on the way: a failing `BEGIN` / `settings` statement leaked the pooled client, and after the leak fix the connection still went back inside an aborted transaction — now `ROLLBACK` + release.
- `postgrelize/effect` entry (separate build entry + package export): findAll/findOne/findByPk/count/create/bulkCreate/insert/upsert/update/destroy/query/transaction; error channel = v6 error classes, other errors are defects.
- Benchmark: `bench/orm.bench.ts` (`--stub` measures ORM overhead with an in-memory pg pool; I/O mode ±50% noise), `bench/compare.ts` gate. Final (best of 3 vs baseline): findAll +1.4%, create +8.1%, bulkCreate −2.1%, insert −0.7% (gate ≤ +10%); findByPk +0.7 µs, count +1.0 µs, managed transaction +4.0 µs absolute.
- Docs: guide `effect.md` with executed example; API reference now has `index` and `effect` modules (links under `/api/index/...`).
- Open: intermittent 15 s test timeouts under the full parallel suite (seen on main too, 1 of 3 runs) — needs investigation.

## Backlog 2 / S4 step 4 — hooks and read pipeline on Effect — done 2026-11-15
- `runHooksEffect` / `runModelHooksEffect` (no hooks → `Effect.void`, no extra nodes); `runHooks` / `runModelHooks` are `runPromise` wrappers, so every hook call goes through Effect.
- `runtime.executeEffect` (transaction / replica routing resolved when the program runs, CLS still via AsyncLocalStorage).
- `findAllProgram` / `countProgram`: hooks → pure query building → execute → pure row mapping → separate includes → `afterFind`; `Model.findAll` / `count` are `runPromise` wrappers (one runtime entry per call). `findOne` / `findByPk` Promise versions unchanged (still call `this.findAll`, so subclass overrides keep working).
- `postgrelize/effect` read operations use the programs natively; `findOne` keeps `rejectOnEmpty` (→ `EmptyResultError` in the error channel); hook exceptions are defects.
- Benchmark gate: findAll −0.4%, create +5.6%, bulkCreate −2.7%, insert −0.9%; small ops unchanged vs step 1–3.
- Remaining: write paths (create / save / update / destroy / bulkCreate) as programs.

## OOP rewrite + Effect removal — done 2026-11-15 (ADR-018)
- Effect and `postgrelize/effect` removed (breaking, 0.8.0); begin-failure fix kept (ROLLBACK + release).
- Classes per area (commits on `refactor/oop`): connection (`ConnectionConfig`, `ConnectionManager`, `ReplicaRouter`, `QueryLogger`, `CopyEncoder`, `NotificationListener`), `PgErrorMapper`, `Transaction` / `TransactionContext` / `TransactionRunner`, `HookRegistry`; `SqlCompiler`, `SqlAst`, `OrderDirection`, `WhereCompiler`, expression classes (`SqlExpression` + `Literal`, `Fn`, ...; `instanceof` via a `Symbol.for` kind tag so ESM/CJS copies interoperate); data type classes, `ArrayLiteralParser`, `InstanceValidator`, `StandardSchemaValidator`, `BuiltinValidators`, `DdlGenerator`, `SqlLiteral`, `SchemaSynchronizer`, `RawQuery`; `Association` + `BelongsTo` / `HasOne` / `HasMany` / `BelongsToMany`, `AssociationKeys`, `IncludeResolver`, `IncludeQueryBuilder`, `IncludeLoader`, `NestedCreator`; model internals (`ModelDefinition`, `ModelRegistry`, `ScopeRegistry`, query builders, `OnConflictBuilder`, `CteBuilder`, `RowMapper`, `InstanceLifecycle`, `InstanceValues`, `InstanceState`, operation classes), `QueryResultShaper`.
- Remaining exported non-class values: constant tables (`Op`, `DataTypes`, `QueryTypes`, `HOOK_TYPES`, `ISOLATION_LEVELS`, `LOCK`, `TRANSACTION_TYPES`, `Deferrable`, `runtimeKey`) and the public v6 factories (`literal`, `fn`, `col`, ...).
- Visible changes: association objects are class instances with v6 methods; `DataTypes` values are frozen class instances; Model statics are no longer `async` functions (still return promises); `keyof Model` includes an internal symbol method.
- Bug found while verifying: `describeTable` enum values were looked up by type name in any schema (inherited from v6) and unordered — now schema-qualified and in `enumsortorder` (regression test).
- 254 tests green; benchmark vs pre-Effect baseline: findAll −5.4%, create −7.0%, bulkCreate −7.3%, insert −10.3%.
