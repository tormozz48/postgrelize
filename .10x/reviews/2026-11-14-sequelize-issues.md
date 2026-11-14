# Open sequelize/sequelize issues (v6 + PostgreSQL) vs postgrelize

Date: 2026-11-14 · postgrelize 0.5.0 (`main` @ 90f1208) · reference: `sequelize@6.37.x` from `node_modules` · PostgreSQL 16 (docker, port 54329).

## Method

- Open issues were collected with `gh issue list --search` (label `dialect: postgres`, plus keyword searches: postgres, jsonb, upsert, conflict, subQuery, enum, returning, bulkCreate, timezone, array, decimal, bigint, alter, schema, transaction, include limit, dateonly, json). That gave 718 unique open issues. Issues about other dialects only, v7-only APIs, sequelize-cli, meta/CI and support questions were dropped. 73 issues are classified below. Most are bugs with a reproduction; well-known PostgreSQL feature requests are included too.
- Each issue was reproduced where possible with a dual-library harness. The same scenario runs on `sequelize` v6 and on `postgrelize` (`src/index.ts` via `npx tsx`), each in a fresh schema that is dropped afterwards. The scripts are in the session scratchpad (`repro/h.ts`, `repro/b1.ts` … `repro/b14.ts`) and were not added to the repo.
- **Verified** = the result comes from running code. **Code** = the result comes from reading the source only.

### Status legend

| Status | Meaning |
| --- | --- |
| FIXED | postgrelize behaves correctly for the scenario in the issue. |
| INHERITED | postgrelize shows the same wrong behaviour as v6 (sometimes with a different error). |
| REGRESSION | **Extra status added by this review.** The issue's scenario is broken in postgrelize but works in sequelize 6.37 (the issue was fixed upstream, was v7-only, or touches a related path). These are the most urgent items for a drop-in replacement. |
| NOT-APPLICABLE | The v6 API or feature involved is not implemented in postgrelize. |
| UNKNOWN | Could not be determined. |

### Counts

| Status | Count |
| --- | --- |
| FIXED | 43 |
| INHERITED | 14 |
| REGRESSION | 8 (7 distinct root causes; #15466 and #11100 share one) |
| NOT-APPLICABLE | 7 |
| UNKNOWN | 1 |
| **Total** | **73** |

(Bugs: 61, feature requests: 12. Of the FIXED items, 3 rest on code reading only: #18362 is partly verified, #18320 and #15058.)

## Summary table

| # | Title | Cat. | Status | Evidence |
| --- | --- | --- | --- | --- |
| [18617](https://github.com/sequelize/sequelize/issues/18617) | JSON where: v6 Postgres paths don't quote keys | bug | INHERITED | Verified: keys `a,b`, `C:\tmp`, `say "hi"` → `[0,0,1,malformed array literal]` on both |
| [18423](https://github.com/sequelize/sequelize/issues/18423) | `sync({ force, schema })` drops tables in default schema | bug | INHERITED | Verified: `schema` sync option silently ignored; default-schema table dropped and recreated, nothing in the target schema |
| [18379](https://github.com/sequelize/sequelize/issues/18379) | Sync fails when multiple schemas contain same-named table | bug | FIXED | Verified: `sync` + `sync({alter})` OK; describeTable joins `st.schemaname` (`src/query-interface/query-interface.ts:279`) |
| [18362](https://github.com/sequelize/sequelize/issues/18362) | PG column queries parse generated SQL | bug | FIXED | Code + verified via #17544: `changeColumnSql` works from the normalized column object (`src/ddl/ddl.ts` ~l.300) |
| [18320](https://github.com/sequelize/sequelize/issues/18320) | Normalize generated-column expressions in alter drift detection | bug | FIXED | Code: `sync({alter})` skips generated/identity columns (`src/query-interface/sync.ts:92`). Caveat: real expression changes are not detected either |
| [18306](https://github.com/sequelize/sequelize/issues/18306) | `Op.in: []` emits `IN (NULL)`, `Op.not` around it returns 0 rows | bug | FIXED | Verified: v6 `[0,0,2]`, pgz `[2,2,2]` (`IN []` → `FALSE`, `src/where/where.ts:259`) |
| [18256](https://github.com/sequelize/sequelize/issues/18256) | belongsToMany subquery omits custom `sourceKey` | bug | INHERITED | Verified: pgz `column User.uuid does not exist` (v6: `integer = character varying`) |
| [17806](https://github.com/sequelize/sequelize/issues/17806) | Postgres join with schema errors | bug | FIXED | Verified: SQL correct (`LEFT OUTER JOIN "S_t"."Users" AS "user" ON "Todo"."userId" = "user"."id"`). The repro script still fails because of the separate regression A1 below |
| [17769](https://github.com/sequelize/sequelize/issues/17769) | upsert not returning PK for concurrent duplicates | bug | FIXED | Verified: both concurrent upserts return `id` |
| [17570](https://github.com/sequelize/sequelize/issues/17570) | findOrCreate breaks logical replication (temp function DDL) | bug | FIXED | Verified: SQL log shows `START TRANSACTION; INSERT; COMMIT`, no `pg_temp` function (`src/model/model.ts:1837-1863`) |
| [17486](https://github.com/sequelize/sequelize/issues/17486) | Custom timestamp column names break explicit timestamps in upsert | bug | REGRESSION | Verified: v6 keeps the supplied `updated_at`, pgz overwrites it with `now()` |
| [17455](https://github.com/sequelize/sequelize/issues/17455) | upsert returns wrong ID for an existing row | bug | FIXED | Verified (composite unique key): returned id = existing id |
| [17435](https://github.com/sequelize/sequelize/issues/17435) | `undefined` in JSON fields breaks change detection | bug | FIXED | Verified: v6 issues 1 UPDATE, pgz 0 |
| [17288](https://github.com/sequelize/sequelize/issues/17288) | describeTable fails with column comments + same table in two schemas | bug | FIXED | Verified: v6 `more than one row returned by a subquery`, pgz returns the right comment |
| [17118](https://github.com/sequelize/sequelize/issues/17118) | addColumn ENUM with a comment ending in `)` → unterminated string | bug | REGRESSION | Verified: no syntax error, but `addColumn` **drops the `comment` silently for every type** (v6 emits `COMMENT ON COLUMN`) |
| [17544](https://github.com/sequelize/sequelize/issues/17544) | `ENUM('PREFERENCES')` parsed as `REFERENCES` | bug | FIXED | Verified (changeColumn on PG): enum created, no FK |
| [16929](https://github.com/sequelize/sequelize/issues/16929) | Increment with `literal()` in upsert does not work on PG | bug | INHERITED | Verified: both fail (`invalid reference to FROM-clause entry`); workaround through the pgz `onConflict` extension verified |
| [16787](https://github.com/sequelize/sequelize/issues/16787) | describeTable default value parsing is buggy | bug | INHERITED | Verified: `'it''s'`→`"its"`, `'x::y'`→`"x"`, `42`→`"42"`, `now()` cannot be told apart from a constant |
| [16445](https://github.com/sequelize/sequelize/issues/16445) | getForeignKeyReferencesForTable does not filter by schema | bug | FIXED | Verified: v6 returns another schema's FK (1), pgz returns 0 |
| [16404](https://github.com/sequelize/sequelize/issues/16404) | bulkCreate updateOnDuplicate with UUID PK makes bad SQL | bug | FIXED | Verified |
| [16239](https://github.com/sequelize/sequelize/issues/16239) | bulkCreate wrong ON CONFLICT target for composite PK | bug | FIXED | Verified: `ON CONFLICT ("account_id","plant_id","material_id")` |
| [16043](https://github.com/sequelize/sequelize/issues/16043) | `{ [Op.any]: [1] }` fails | bug | INHERITED | Verified: v6 `malformed array literal`, pgz `Unsupported operator: Symbol(any)`; `{[Op.eq]: {[Op.any]: [1]}}` works |
| [15860](https://github.com/sequelize/sequelize/issues/15860) | Cloning `ARRAY` fails with scopes | bug | FIXED | Verified |
| [15646](https://github.com/sequelize/sequelize/issues/15646) | Remapping minified aliases can lose data | bug | NOT-APPLICABLE | Code: `minifyAliases` is not implemented (no match in `src/`) |
| [15543](https://github.com/sequelize/sequelize/issues/15543) | Index not created when table exists in another schema | bug | FIXED | Verified: index created in both schemas |
| [15522](https://github.com/sequelize/sequelize/issues/15522) | Cyclic FKs + ENUM can't be synced | bug | REGRESSION | Verified: pgz cannot sync **any** FK cycle (`relation "As" does not exist`, with or without ENUM); v6.37 handles both |
| [15466](https://github.com/sequelize/sequelize/issues/15466) | ARRAY(ENUM) sometimes returned as string | bug | REGRESSION | Verified: pgz **always** returns `"{ADMIN}"` (find, create, findOrCreate); v6 returns `["ADMIN"]` |
| [15058](https://github.com/sequelize/sequelize/issues/15058) | upsert second element is always `null` | bug/docs | FIXED | Code: `null` like v6; with `onConflict` returns `created` boolean (`src/model/model.ts:1147`) |
| [14497](https://github.com/sequelize/sequelize/issues/14497) | upsert fails with `GENERATED ALWAYS` identity id | bug | INHERITED | Verified: both `cannot insert a non-DEFAULT value into column "id"`; `upsert` ignores `overriding`; `Model.insert({overriding:'system', onConflict})` works |
| [14470](https://github.com/sequelize/sequelize/issues/14470) | create `ignoreDuplicates` throws EmptyResultError | bug | NOT-APPLICABLE | Verified: `create({ignoreDuplicates})` is not supported and silently ignored → UniqueConstraintError; `create(..., {onConflict:{action:'nothing'}})` returns an instance with `wasInserted=false` |
| [14062](https://github.com/sequelize/sequelize/issues/14062) | `searchPath` not quoted | bug | NOT-APPLICABLE | Verified: the `searchPath` option is ignored (search_path unchanged); use `dialectOptions.options: '-c search_path=...'` |
| [13734](https://github.com/sequelize/sequelize/issues/13734) | upsert uses wrong ON CONFLICT target with composite unique index | bug | REGRESSION | Verified: v6.37 → `ON CONFLICT ("subjectId","objectId")`, pgz → `ON CONFLICT ("id")` → UniqueConstraintError. Same for `bulkCreate({updateOnDuplicate})` |
| [13184](https://github.com/sequelize/sequelize/issues/13184) | `Model.drop()` throws without options | bug | FIXED | Verified |
| [13167](https://github.com/sequelize/sequelize/issues/13167) | `sync({alter})` → `type "serial" does not exist` | bug | INHERITED | Verified: no error, but alter emits `DROP DEFAULT` + `TYPE INTEGER` for the autoIncrement column, so the sequence default is lost and later inserts get `seqNo = NULL` |
| [12971](https://github.com/sequelize/sequelize/issues/12971) | `$assoc.col$` + `limit` + hasMany include → missing FROM | bug | INHERITED | Verified: same `missing FROM-clause entry for table "Instruments"` |
| [12961](https://github.com/sequelize/sequelize/issues/12961) | `sync({alter})` duplicates FKs with schemas | bug | FIXED | Verified: v6 3 FKs after 3 syncs, pgz 1 |
| [12948](https://github.com/sequelize/sequelize/issues/12948) | Memory leak using findAll | bug | UNKNOWN | Needs a long-running heap profile; not reproduced |
| [12595](https://github.com/sequelize/sequelize/issues/12595) | upsert invalid ON CONFLICT for partial unique index | bug | INHERITED | Verified: v6 API fails on both (pgz targets `("id")`); `onConflict: {target:{columns, where}}` works |
| [11968](https://github.com/sequelize/sequelize/issues/11968) | upsert doesn't un-delete paranoid rows | bug | INHERITED | Verified: count 0 after upsert on both |
| [11749](https://github.com/sequelize/sequelize/issues/11749) | Missing `::VARCHAR[]` cast for `Op.contains` via `$nested$` | bug | FIXED | Verified: v6 `character varying[] @> text[]` error, pgz returns 1 |
| [11748](https://github.com/sequelize/sequelize/issues/11748) | Can't update a row with an empty array | bug | FIXED | Verified |
| [11634](https://github.com/sequelize/sequelize/issues/11634) | `Model.schema()` not propagated to associations | bug | NOT-APPLICABLE | Code: `Model.schema()` is not implemented |
| [11288](https://github.com/sequelize/sequelize/issues/11288) | Order and limit by included model | feature | INHERITED | Verified: same SQL as v6 (`LIMIT` in subquery, order outside) |
| [11223](https://github.com/sequelize/sequelize/issues/11223) | bulkCreate updateOnDuplicate: no PK for new rows | bug | FIXED | Verified: `[1,2,3]` |
| [11204](https://github.com/sequelize/sequelize/issues/11204) | bulkCreate ignores trigger-set values | bug | FIXED | Verified: returns `"gen"` |
| [11146](https://github.com/sequelize/sequelize/issues/11146) | Missing FROM with `include.separate: false` | bug | INHERITED | Verified: `separate:false` + `$ToDos.title$` + `limit` → same error; with both includes pgz returns `ToDos` = null |
| [11100](https://github.com/sequelize/sequelize/issues/11100) | findOrCreate returns ARRAY(ENUM) as `'{X}'` string | bug | REGRESSION | Verified: same as #15466 (v6.37 OK, pgz always a string) |
| [10952](https://github.com/sequelize/sequelize/issues/10952) | removeIndex with schema | bug | FIXED | Verified: `DROP INDEX IF EXISTS "S_b"."user_username"` (v6 `"[object _object]_username"`) |
| [10710](https://github.com/sequelize/sequelize/issues/10710) | upsert broken with `literal('uuid_generate_v4()')` default | bug | FIXED | Verified |
| [10533](https://github.com/sequelize/sequelize/issues/10533) | SUM returns string | bug | FIXED | Verified: numbers for sum/max/avg |
| [9853](https://github.com/sequelize/sequelize/issues/9853) | AVG not properly averaging | bug | FIXED | Verified: v6 `avg` of 1,2 → `1`, pgz → `1.5` |
| [10435](https://github.com/sequelize/sequelize/issues/10435) | Ambiguous column with JOIN + GROUP BY | bug | FIXED | Verified: v6 `column reference "ActionId" is ambiguous`, pgz `[{ActionId:'a1',count:1}]` |
| [10419](https://github.com/sequelize/sequelize/issues/10419) | updatedAt not updating on upsert | bug | REGRESSION | Verified: with explicitly declared `createdAt`/`updatedAt` attributes, pgz **`create()` throws** `notNull Violation: createdAt cannot be null` (v6 works and updates `updated_at`) |
| [10966](https://github.com/sequelize/sequelize/issues/10966) | bulkCreate returns `Literal` for literal defaults | bug | FIXED | Verified |
| [9635](https://github.com/sequelize/sequelize/issues/9635) | changeColumn does not drop NOT NULL | bug | FIXED | Verified: `allowNull: true`, FK kept |
| [9565](https://github.com/sequelize/sequelize/issues/9565) | JSONB keys replaced with column names | bug | FIXED | Verified |
| [9040](https://github.com/sequelize/sequelize/issues/9040) | jsonb ints ordered as text | bug | REGRESSION | Verified: v6 orders by `#>>` (as text); pgz `order: ['data.number']` throws `missing FROM-clause entry for table "data"` |
| [7941](https://github.com/sequelize/sequelize/issues/7941) | Concurrent findOrCreate fails with comma in unique value | bug | FIXED | Verified: 6 concurrent calls, 0 rejections, 1 row |
| [6485](https://github.com/sequelize/sequelize/issues/6485) | Handling NULL bytes | bug | NOT-APPLICABLE | Verified: PostgreSQL text cannot hold `0x00`; pgz raises `DatabaseError` while v6 silently stores the two characters `\0`. Behaviour differs from v6 |
| [5173](https://github.com/sequelize/sequelize/issues/5173) | `Op.contains` on a nested JSONB array path | bug | INHERITED | Verified: `text @> unknown` (pgz) / `text @> text[]` (v6) |
| [3000](https://github.com/sequelize/sequelize/issues/3000) | Datetimes wrong with TIMESTAMP WITHOUT TIME ZONE | bug | FIXED | Verified with `TZ=Europe/Berlin`, with and without `timezone: '+02:00'`: round-trip exact (v6 off by -1h / +1h) |
| [15883](https://github.com/sequelize/sequelize/issues/15883) | Crash when the connection fails | bug | FIXED | Verified: rejects with `SequelizeConnectionRefusedError` |
| [11656](https://github.com/sequelize/sequelize/issues/11656) | ON CONFLICT DO UPDATE with WHERE | feature | FIXED | Verified: `Model.insert(..., {onConflict:{action:{update, where}}})` → `[5,7]` |
| [12382](https://github.com/sequelize/sequelize/issues/12382) | `returning` on `Model.destroy()` | feature | FIXED | Verified: `DELETE ... RETURNING` |
| [14750](https://github.com/sequelize/sequelize/issues/14750) | Returning values after delete | feature | FIXED | Verified (same as #12382) |
| [12718](https://github.com/sequelize/sequelize/issues/12718) | VIRTUAL/GENERATED STORED columns | feature | FIXED | Verified: `GENERATED ALWAYS AS ("a" * 2) STORED`, never written, refreshed on update |
| [4900](https://github.com/sequelize/sequelize/issues/4900) | INTERVAL data type | feature | FIXED | Verified |
| [5475](https://github.com/sequelize/sequelize/issues/5475) | `SELECT DISTINCT ON` | feature | FIXED | Verified |
| [11671](https://github.com/sequelize/sequelize/issues/11671) | JSONB `?` operator | feature | FIXED | Verified: `Op.hasKey` |
| [12612](https://github.com/sequelize/sequelize/issues/12612) | IS [NOT] DISTINCT FROM | feature | FIXED | Verified: `Op.isDistinctFrom` |
| [12654](https://github.com/sequelize/sequelize/issues/12654) | NOWAIT in SELECT FOR UPDATE | feature | FIXED | Verified: `{lock: true, noWait: true}` → `FOR UPDATE NOWAIT` |
| [2577](https://github.com/sequelize/sequelize/issues/2577) | ENUM naming / reuse | feature | NOT-APPLICABLE | Verified: `ENUM({values, name})` ignores `name`, one type per table/column |
| [2572](https://github.com/sequelize/sequelize/issues/2572) | Column without time zone | feature | NOT-APPLICABLE | Code: `DATE` always maps to `TIMESTAMP WITH TIME ZONE` (`src/data-types/data-types.ts:153`); existing `timestamp` columns are read correctly (#3000) |

Excluded after triage (other dialect only or not a reproducible PG bug): #15422 (MySQL, minifyAliases), #14747 (MySQL JSON_EXTRACT), #13997 (MySQL renameColumn), #11048 (support question).

---

## REGRESSION details (works in sequelize 6.37, broken in postgrelize)

### R1. #13734: upsert / bulkCreate ignore unique `indexes` when choosing the conflict target

```ts
const E = s.define('Entry', { subjectId: INTEGER, objectId: INTEGER, mask: STRING },
  { indexes: [{ fields: ['subjectId', 'objectId'], unique: true }], timestamps: false });
await E.upsert({ subjectId: 1, objectId: 2, mask: 'a' });
await E.upsert({ subjectId: 1, objectId: 2, mask: 'b' });
// v6:  ON CONFLICT ("subjectId","objectId") → row updated
// pgz: ON CONFLICT ("id") → SequelizeUniqueConstraintError
await E.bulkCreate([{ subjectId: 1, objectId: 2, mask: 'y' }], { updateOnDuplicate: ['mask'] }); // same failure
```

Expected (v6, `query-interface.js:318-338`, `model.js:1679-1691`): `upsert` looks for a key that contains one of the updated fields, first in `uniqueKeys`, then in `_indexes` with `unique: true`. `bulkCreate` uses the fields of unique indexes that have no `where`, plus the first unique key. Fix: `src/model/conflict.ts` (`v6UpsertConflict` l.72, `v6BulkConflict`/`firstUniqueKey` l.19-44). Consider the model's unique `indexes` there.

### R2. #10419: explicitly declared `createdAt`/`updatedAt` attributes break `create()`

```ts
const E = s.define('enquiry', {
  details: DataTypes.TEXT,
  createdAt: { field: 'created_at', type: DataTypes.DATE },
  updatedAt: { field: 'updated_at', type: DataTypes.DATE },
});
await E.sync();
await E.create({ details: 'a' });
// v6:  OK, created_at/updated_at set
// pgz: SequelizeValidationError notNull Violation: enquiry.createdAt cannot be null
```

Cause: in `normalizeDefinition` the defaults from `timestampAttributes(...)` are spread **after** the user attributes (`src/model/definition.ts:266-270`). The user definition (including `field`) is overwritten with `{ type: DATE, allowNull: false }`, and the `_autoGenerated` flag is not set because the name is in `attributes`, so validation runs before the timestamps are filled. Fix: merge the user-declared timestamp attributes over the defaults and still mark them as timestamp attributes for validation.

### R3. #17486: upsert overwrites explicitly supplied `updatedAt`

```ts
const E = s.define('E', { k: { type: STRING, unique: true } }, { createdAt: 'created_at', updatedAt: 'updated_at' });
const d = new Date('2020-01-01T00:00:00Z');
await E.upsert({ k: 'a', created_at: d, updated_at: d }); await E.upsert({ k: 'a', created_at: d, updated_at: d });
// v6:  updated_at = 2020-01-01 ; pgz: updated_at = now()
```

v6 `upsert` sets timestamps only `if (!insertValues[updatedAtAttr])` (`model.js:1515-1521`). Fix: `src/model/model.ts:1126-1129` / `withTimestamps` (`src/model/values.ts:93`). Do not overwrite timestamps the caller provided in `upsert`.

### R4. #15466 / #11100: `ARRAY(ENUM)` values are returned as raw strings

```ts
const U = s.define('U', { nick: STRING, roles: { type: DataTypes.ARRAY(DataTypes.ENUM('ADMIN','CLIENT')), defaultValue: [] } });
const [a] = await U.findOrCreate({ where: { nick: 'n' }, defaults: { roles: ['ADMIN'] } });
// v6: ['ADMIN'] everywhere ; pgz: '{ADMIN}' from findOrCreate, findOne and create
```

`pg` has no parser for array types of user-defined enums (v6 registers them via `refreshOidMap`). Fix: `src/data-types/data-types.ts:160` (`arrayType`). Add a `parse` that decodes PostgreSQL array literals (`postgres-array`) when the element type has no driver parser (ENUM), or register parsers for enum array OIDs in `src/connection/executor.ts:63`.

### R5. #15522: cyclic foreign keys cannot be synced at all

```ts
const A = s.define('A', { st: DataTypes.STRING }); const B = s.define('B', {});
A.belongsTo(B); B.belongsTo(A);
await s.sync(); // v6.37 OK (two passes: tables, then FKs); pgz: relation "As" does not exist
```

Fix: `src/sequelize.ts:459` (`sync`) and `dependencyOrder` (`src/query-interface/sync.ts:182`). Create the tables without the FKs that form a cycle, then `ALTER TABLE ... ADD FOREIGN KEY`. Keep enum creation idempotent (it already uses `DO ... EXCEPTION WHEN duplicate_object`).

### R6. #17118: `addColumn` drops `comment`

```ts
await qi.addColumn('M', 'note', { type: DataTypes.TEXT, comment: 'note (x)' });
// v6: ALTER TABLE ... ADD COLUMN "note" TEXT; COMMENT ON COLUMN "M"."note" IS 'note (x)'
// pgz: ALTER TABLE "M" ADD COLUMN "note" TEXT   (comment lost; col_description = null)
```

The original syntax error is gone, but the comment is silently discarded. Fix: `src/query-interface/query-interface.ts:313` (`addColumn`). Append a `COMMENT ON COLUMN` statement as `createTable`/`sync` already do.

### R7. #9040: ordering by a JSON path string throws

```ts
const M = s.define('Model', { data: DataTypes.JSONB });
await M.findAll({ order: ['data.number'] });           // pgz: missing FROM-clause entry for table "data"
await M.findAll({ order: [['data.number', 'ASC']] });  // same
// v6: ORDER BY ("Model"."data"#>>'{number}')   (works, but sorts as text, which is the issue itself)
```

Fix: `src/model/query-builders.ts:175-185` (`orderTarget`). When the first segment is a JSON attribute of the model, build a JSON path accessor (ideally `#>` jsonb, which sorts numbers numerically, which also fixes the original issue) instead of `ident(...target.split('.'))`.

### A1 (found while reproducing #17806, no dedicated issue): included associations are not instance properties

```ts
T.belongsTo(U, { as: 'user' }); U.hasMany(T);
const [todo] = await T.findAll({ include: [{ model: U, as: 'user' }] });
todo.user;          // v6: instance ; pgz: undefined   (todo.get('user') and toJSON() work)
(await U.findAll({ include: [T] }))[0].Todos; // v6: array ; pgz: undefined
```

Applies to `define()` and to class-based `init()` models. Only attributes get accessors (`defineAttributeAccessors`, `src/model/state.ts:113`). Fix: define a getter (and setter) for each association `as` on `association.source.prototype` when the association is created (`src/associations/associate.ts`, next to the mixin `defineProperty` at l.667). This is probably the highest-impact drop-in incompatibility found. The differential suite compares `toJSON()` and does not catch it.

---

## INHERITED details

### #18617: JSON path keys are not escaped
```ts
const D = s.define('Doc', { meta: DataTypes.JSONB });
await D.create({ meta: { 'a,b': 2, 'C:\\tmp': 1, 'say "hi"': 4 } });
await D.count({ where: { meta: { 'a,b': 2 } } });      // 0, expected 1
await D.count({ where: { meta: { 'say "hi"': 4 } } }); // malformed array literal
```
Expected: 1 for every key. Fix: `src/where/where.ts:59-61` (`jsonOperand`). Pass the path as a JS array parameter (`param(json.path)`, which `pg` serializes with correct quoting) instead of `` `{${path.join(',')}}` ``.

### #5173: `Op.contains` on a nested JSONB path
```ts
await M.count({ where: { doc: { browsers: { [Op.contains]: ['chrome'] } } } }); // text @> unknown
```
Expected: `"doc" #> '{browsers}' @> '["chrome"]'::jsonb` → 1. Fix: `src/where/where.ts` (`jsonNested`/`comparison`). Use `#>` (jsonb) instead of `#>>` for `@>`, `<@`, `?`, `?|`, `?&` and JSON-serialize the operand.

### #16043: `{ [Op.any]: [...] }` shorthand
```ts
await F.count({ where: { user_id: { [Op.any]: [1] } } }); // pgz: Error: Unsupported operator: Symbol(any)
```
Expected: `"user_id" = ANY($1)` → 1 (v6 docs show `[Op.any]: [2,3]`). Fix: `src/where/where.ts` `applyOperator` (~l.350). Treat a top-level `Op.any`/`Op.all` as `=` with a quantifier (the `comparison` path already supports `{[Op.eq]:{[Op.any]:[...]}}`).

### #18423: `sync({ force: true, schema })`
```ts
await U.sync(); await U.create({});
await s.sync({ force: true, schema: 'tenant' });
// pgz: DROP TABLE "Us" (default schema) and recreates it there; nothing is created in "tenant"
```
Expected: drop/create only `"tenant"."Us"`. Fix: `src/query-interface/sync.ts:24` (`SyncOptions` has no `schema`) and `src/sequelize.ts:459`. Either support `schema` (qualify `dropModel`/`syncModel` tables) or reject unknown options. Silently ignoring them is destructive here.

### #13167: `sync({ alter: true })` on a non-PK `autoIncrement` column
```ts
s.define('Order', { id: { type: UUID, primaryKey: true, defaultValue: UUIDV4 },
  seqNo: { type: INTEGER, autoIncrement: true }, description: { type: STRING, allowNull: false } }, { tableName: 'orders' });
await s.sync(); await s.sync({ alter: true });
await Order.create({ description: 'x' }); // seqNo = NULL (expected 1)
```
Alter emits `ALTER COLUMN "seqNo" DROP DEFAULT` + `TYPE INTEGER`, which removes the `nextval()` default. Fix: `src/ddl/ddl.ts` `changeColumnSql` (~l.300-310) and/or `src/query-interface/sync.ts:84-94`. Leave the default of `autoIncrement` columns alone (or only emit ALTERs for real differences against `describeTable`). Every alter also currently re-issues DROP NOT NULL/DROP DEFAULT/TYPE for every column.

### #16787: describeTable `defaultValue` parsing
```sql
CREATE TABLE d (a text DEFAULT 'it''s', b int DEFAULT 42, c text DEFAULT 'x::y', f timestamptz DEFAULT now());
```
pgz → `{a:"its", b:"42", c:"x", f:"now()"}`; expected `{a:"it's", b:42, c:"x::y"}` plus a way to tell `now()` (expression) from a literal. Fix: `cleanDefault` in `src/query-interface/query-interface.ts:82`. Parse `'...'::type` literals properly (un-double quotes, strip only the trailing cast).

### #18256: belongsToMany with custom `sourceKey` + `limit`
```ts
const tags = User.belongsToMany(Tag, { through: 'UserTags', sourceKey: 'uuid' });
await User.findAll({ attributes: ['id'], include: [{ association: tags, attributes: [], through: { attributes: [] }, required: true }], limit: 10 });
// pgz: column User.uuid does not exist
```
Expected: `[1]`. Fix: `src/associations/include.ts` (subquery attribute list). Always project the association's `sourceKey` into the derived table when a subquery is used.

### #12971 / #11146: `$nested.col$` in top-level `where` with a hasMany include and `limit`
```ts
await User.findAll({ where: { '$Instruments.id$': { [Op.is]: null } }, include: { model: Tool, as: 'Instruments' }, limit: 2 });
// missing FROM-clause entry for table "Instruments"
```
Expected: valid SQL (move the condition to the outer query, or turn off the subquery automatically when the top-level where references a non-`separate` to-many include). Fix: `src/associations/include.ts` (subQuery decision). For #11146 with two includes of the same alias (`separate:false` + `separate:true`), pgz runs without error but returns `ToDos = null`. Duplicate aliases should either merge or throw.

### #14497: upsert with `GENERATED ALWAYS` identity
```ts
// table: id bigint GENERATED ALWAYS AS IDENTITY
await S.upsert({ id: 1, name: 'y' }, { overriding: 'system' }); // cannot insert a non-DEFAULT value into column "id"
```
Expected: `INSERT ... OVERRIDING SYSTEM VALUE ... ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name"` (no `SET "id"`). Fix: `src/model/model.ts:1134` (`buildInsert` in `upsert` does not forward `options.overriding`). `Model.insert([...], { overriding: 'system', onConflict })` already works.

### #12595: upsert with a partial unique index
```ts
indexes: [{ unique: true, fields: ['first_id','second_id'], where: { stamped_at: null } }]
await M.upsert({ first_id: 1, second_id: 1 }); // twice → pgz UniqueConstraintError (targets "id")
```
Expected: `ON CONFLICT ("first_id","second_id") WHERE "stamped_at" IS NULL`. Fix: together with R1 in `src/model/conflict.ts`. Include the index `where` as the conflict target predicate (`conflictUpdate` already supports `where`). Workaround verified: `upsert(v, { onConflict: { target: { columns: [...], where: { stamped_at: null } }, action: 'nothing' } })`.

### #16929: `literal()` increment through `upsert`
```ts
await B.upsert({ address: 'a', chainId: 'c', balance: literal('"bal"."balance" + 1') }, { fields: ['balance'], conflictFields: ['address','chainId'] });
// invalid reference to FROM-clause entry for table "bal"
```
This is inherent to the v6 semantics: the value goes into `VALUES` and `SET` uses `EXCLUDED`. Workaround verified: `upsert({..., balance: 1}, { onConflict: { target: [...], action: { update: { balance: literal('"bal"."balance" + EXCLUDED."balance"') } } } })` → 6. Optional fix: in `v6UpsertConflict` put literal values into `DO UPDATE SET` and insert `DEFAULT` or the evaluated base value.

### #11968: upsert does not restore soft-deleted rows
```ts
const t = await T.create({ id: 1 }); await t.destroy(); await T.upsert({ id: 1 });
await T.count(); // 0 (expected 1)
```
Fix (if adopted): `v6UpsertConflict` in `src/model/conflict.ts`. Add `deletedAt = NULL` to `DO UPDATE SET` for paranoid models. This is a behaviour change from v6, so it should be opt-in or documented.

### #11288: order + limit by an included hasMany column (feature)
`A.findAll({ include: [B], order: [[B, 'title', 'ASC']], limit: 1 })` limits in the subquery before ordering, as v6 does. Possible approach: a `LATERAL`/window-function subquery. Low priority.

---

## Other findings while reproducing (no open issue picked)

1. **bulkCreate `ignoreDuplicates` maps returned rows to the wrong instances** (same as v6). `bulkCreate([{k:'a'},{k:'b'}], {ignoreDuplicates:true})` with `a` already present returns `[{id:3,k:'b'},{id:null,k:'b'}]`: the first instance takes row 0 of `RETURNING`. Fix: `src/model/model.ts:1239`. Match returned rows by key, or add `RETURNING` ordinality (e.g. `INSERT ... SELECT ... WITH ORDINALITY`).
2. **`create({ ignoreDuplicates: true })` is silently ignored** (#14470). Options postgrelize does not support pass type checks only through `any`, but plain JS users get no error. A runtime warning or error for unsupported v6 options would make gaps visible (also relevant to `searchPath`, `sync({schema})`, `minifyAliases`).
3. `sync({ alter: true })` emits `DROP NOT NULL` / `DROP DEFAULT` / `TYPE` for every column on every run (see #13167). This is harmless for plain columns but costly on large tables (type rewrite checks), and it drops server-side defaults that the model does not declare.

## Items whose FIXED status rests on code reading only

- #18320: `src/query-interface/sync.ts:92` skips generated columns in alter (no false drift; also no detection of real changes).
- #15058: `src/model/model.ts:1147` (`created` boolean when `onConflict` is used).
- #18362: partly; the attribute-object based DDL was verified indirectly through #17544 and #17118.
- #15646 (NOT-APPLICABLE), #11634 (NOT-APPLICABLE), #2572 (NOT-APPLICABLE) were also decided by code reading.
