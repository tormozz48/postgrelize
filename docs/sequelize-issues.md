# Sequelize issues fixed in postgrelize

Open issues of [sequelize/sequelize](https://github.com/sequelize/sequelize/issues) that affect Sequelize v6 on PostgreSQL, checked against postgrelize (review of 73 issues, 2026-11-14). Fixes made in postgrelize and the v6 parity items have regression tests in this repository; the "works correctly" list was verified with reproduction scripts run on both libraries at review time.

## Bugs fixed in postgrelize (Sequelize v6 still affected)

These fixes intentionally differ from Sequelize v6 ([ADR-016](https://github.com/tormozz48/postgrelize/blob/main/.10x/adrs/016-v6-bug-divergence.md)).

| Issue                                                         | Fixed behaviour                                                                                                                                                                         |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#18617](https://github.com/sequelize/sequelize/issues/18617) | JSON `where` keys with `,`, `"` or `\` are matched correctly                                                                                                                            |
| [#5173](https://github.com/sequelize/sequelize/issues/5173)   | jsonb operators (`Op.contains`, `Op.hasKey`, …) on nested JSON paths                                                                                                                    |
| [#16043](https://github.com/sequelize/sequelize/issues/16043) | `{ [Op.any]: [...] }` shorthand                                                                                                                                                         |
| [#14497](https://github.com/sequelize/sequelize/issues/14497) | `upsert` with `overriding` on `GENERATED ALWAYS` identity columns                                                                                                                       |
| [#12595](https://github.com/sequelize/sequelize/issues/12595) | `upsert` on a partial unique index uses its predicate                                                                                                                                   |
| (no issue) `paranoid` with `deletedAt: -Infinity`             | A row created with `deletedAt: -Infinity` keeps it and stays hidden from paranoid finders when the attribute defaults to `Infinity`; v6 stored it as `Infinity`, so the row looked live |
| (no issue) `createTrigger` function arguments                 | Arguments are rendered as literals (`EXECUTE FUNCTION f('a', 1)`); v6 rendered typed parameter declarations, which PostgreSQL rejects                                                   |
| (no issue) bare number `where` on a `paranoid` model          | `findAll({ where: 1 })` filters the primary key; v6 dropped the number and returned every live row. Without `paranoid` both treat it as a primary key lookup                            |
| [#16787](https://github.com/sequelize/sequelize/issues/16787) | `describeTable` unquotes literal defaults (`'it''s'`, `'x::y'`)                                                                                                                         |
| [#13167](https://github.com/sequelize/sequelize/issues/13167) | `sync({ alter })` keeps the sequence of non-key `autoIncrement` columns                                                                                                                 |
| [#18423](https://github.com/sequelize/sequelize/issues/18423) | `sync({ schema })` / `drop({ schema })` work in that schema only                                                                                                                        |
| [#18256](https://github.com/sequelize/sequelize/issues/18256) | `belongsToMany` with a custom `sourceKey` and `limit`                                                                                                                                   |
| [#12971](https://github.com/sequelize/sequelize/issues/12971) | top-level `$include.attr$` condition with a hasMany include and `limit`                                                                                                                 |
| —                                                             | `describeTable` reads enum values of the column's type in its own schema, in declared order (v6 matches the type name in any schema)                                                    |
| —                                                             | `Model.aggregate` validates the function name (v6 inserts it into SQL unchecked)                                                                                                        |
| —                                                             | `transaction({ isolationLevel })` accepts only `ISOLATION_LEVELS` values (v6 inserts it into SQL unchecked)                                                                             |
| —                                                             | `bulkCreate({ ignoreDuplicates })` assigns returned rows to the records that were inserted (v6 mixes them up)                                                                           |
| —                                                             | Nested `create` with a built instance as a child (`Post.create({ Comments: [Comment.build()] }, { include })`) saves and links it (v6 silently drops the child)                         |

## Works correctly in postgrelize

| Issue                                                         | Title                                                                | Kind     |
| ------------------------------------------------------------- | -------------------------------------------------------------------- | -------- |
| [#18379](https://github.com/sequelize/sequelize/issues/18379) | Sync fails when multiple schemas contain same-named table            | bug      |
| [#18362](https://github.com/sequelize/sequelize/issues/18362) | PG column queries parse generated SQL                                | bug      |
| [#18320](https://github.com/sequelize/sequelize/issues/18320) | Normalize generated-column expressions in alter drift detection      | bug      |
| [#18306](https://github.com/sequelize/sequelize/issues/18306) | `Op.in: []` emits `IN (NULL)`, `Op.not` around it returns 0 rows     | bug      |
| [#17806](https://github.com/sequelize/sequelize/issues/17806) | Postgres join with schema errors                                     | bug      |
| [#17769](https://github.com/sequelize/sequelize/issues/17769) | upsert not returning PK for concurrent duplicates                    | bug      |
| [#17570](https://github.com/sequelize/sequelize/issues/17570) | findOrCreate breaks logical replication (temp function DDL)          | bug      |
| [#17544](https://github.com/sequelize/sequelize/issues/17544) | `ENUM('PREFERENCES')` parsed as `REFERENCES`                         | bug      |
| [#17455](https://github.com/sequelize/sequelize/issues/17455) | upsert returns wrong ID for an existing row                          | bug      |
| [#17435](https://github.com/sequelize/sequelize/issues/17435) | `undefined` in JSON fields breaks change detection                   | bug      |
| [#17288](https://github.com/sequelize/sequelize/issues/17288) | describeTable fails with column comments + same table in two schemas | bug      |
| [#16445](https://github.com/sequelize/sequelize/issues/16445) | getForeignKeyReferencesForTable does not filter by schema            | bug      |
| [#16404](https://github.com/sequelize/sequelize/issues/16404) | bulkCreate updateOnDuplicate with UUID PK makes bad SQL              | bug      |
| [#16239](https://github.com/sequelize/sequelize/issues/16239) | bulkCreate wrong ON CONFLICT target for composite PK                 | bug      |
| [#15883](https://github.com/sequelize/sequelize/issues/15883) | Crash when the connection fails                                      | bug      |
| [#15860](https://github.com/sequelize/sequelize/issues/15860) | Cloning `ARRAY` fails with scopes                                    | bug      |
| [#15543](https://github.com/sequelize/sequelize/issues/15543) | Index not created when table exists in another schema                | bug      |
| [#15058](https://github.com/sequelize/sequelize/issues/15058) | upsert second element is always `null`                               | bug/docs |
| [#14750](https://github.com/sequelize/sequelize/issues/14750) | Returning values after delete                                        | feature  |
| [#13184](https://github.com/sequelize/sequelize/issues/13184) | `Model.drop()` throws without options                                | bug      |
| [#12961](https://github.com/sequelize/sequelize/issues/12961) | `sync({alter})` duplicates FKs with schemas                          | bug      |
| [#12718](https://github.com/sequelize/sequelize/issues/12718) | VIRTUAL/GENERATED STORED columns                                     | feature  |
| [#12654](https://github.com/sequelize/sequelize/issues/12654) | NOWAIT in SELECT FOR UPDATE                                          | feature  |
| [#12612](https://github.com/sequelize/sequelize/issues/12612) | IS [NOT] DISTINCT FROM                                               | feature  |
| [#12382](https://github.com/sequelize/sequelize/issues/12382) | `returning` on `Model.destroy()`                                     | feature  |
| [#11749](https://github.com/sequelize/sequelize/issues/11749) | Missing `::VARCHAR[]` cast for `Op.contains` via `$nested$`          | bug      |
| [#11748](https://github.com/sequelize/sequelize/issues/11748) | Can't update a row with an empty array                               | bug      |
| [#11671](https://github.com/sequelize/sequelize/issues/11671) | JSONB `?` operator                                                   | feature  |
| [#11656](https://github.com/sequelize/sequelize/issues/11656) | ON CONFLICT DO UPDATE with WHERE                                     | feature  |
| [#11223](https://github.com/sequelize/sequelize/issues/11223) | bulkCreate updateOnDuplicate: no PK for new rows                     | bug      |
| [#11204](https://github.com/sequelize/sequelize/issues/11204) | bulkCreate ignores trigger-set values                                | bug      |
| [#10966](https://github.com/sequelize/sequelize/issues/10966) | bulkCreate returns `Literal` for literal defaults                    | bug      |
| [#10952](https://github.com/sequelize/sequelize/issues/10952) | removeIndex with schema                                              | bug      |
| [#10710](https://github.com/sequelize/sequelize/issues/10710) | upsert broken with `literal('uuid_generate_v4()')` default           | bug      |
| [#10533](https://github.com/sequelize/sequelize/issues/10533) | SUM returns string                                                   | bug      |
| [#10435](https://github.com/sequelize/sequelize/issues/10435) | Ambiguous column with JOIN + GROUP BY                                | bug      |
| [#9853](https://github.com/sequelize/sequelize/issues/9853)   | AVG not properly averaging                                           | bug      |
| [#9635](https://github.com/sequelize/sequelize/issues/9635)   | changeColumn does not drop NOT NULL                                  | bug      |
| [#9565](https://github.com/sequelize/sequelize/issues/9565)   | JSONB keys replaced with column names                                | bug      |
| [#7941](https://github.com/sequelize/sequelize/issues/7941)   | Concurrent findOrCreate fails with comma in unique value             | bug      |
| [#5475](https://github.com/sequelize/sequelize/issues/5475)   | `SELECT DISTINCT ON`                                                 | feature  |
| [#4900](https://github.com/sequelize/sequelize/issues/4900)   | INTERVAL data type                                                   | feature  |
| [#3000](https://github.com/sequelize/sequelize/issues/3000)   | Datetimes wrong with TIMESTAMP WITHOUT TIME ZONE                     | bug      |

## Matches Sequelize v6 6.37 (fixed upstream, verified here)

| Issue                                                         | Behaviour                                                          |
| ------------------------------------------------------------- | ------------------------------------------------------------------ |
| [#13734](https://github.com/sequelize/sequelize/issues/13734) | upsert / `updateOnDuplicate` conflict target from unique `indexes` |
| [#10419](https://github.com/sequelize/sequelize/issues/10419) | explicitly declared `createdAt` / `updatedAt` attributes           |
| [#17486](https://github.com/sequelize/sequelize/issues/17486) | `upsert` keeps a supplied `updatedAt`                              |
| [#15466](https://github.com/sequelize/sequelize/issues/15466) | `ARRAY(ENUM)` values returned as arrays                            |
| [#11100](https://github.com/sequelize/sequelize/issues/11100) | `findOrCreate` returns `ARRAY(ENUM)` as an array                   |
| [#15522](https://github.com/sequelize/sequelize/issues/15522) | `sync()` with foreign-key cycles                                   |
| [#17118](https://github.com/sequelize/sequelize/issues/17118) | `addColumn` keeps the column comment                               |
| [#9040](https://github.com/sequelize/sequelize/issues/9040)   | `order` by a JSON path; numbers sort numerically                   |

## Intentional differences from Sequelize v6

- Foreign-key cycles: v6 creates the tables without the cyclic foreign keys; postgrelize creates both constraints after all tables exist.
- `order: ['json.path']`: v6 orders the text value (`10, 100, 9`); postgrelize orders the jsonb value (`9, 10, 100`).
- `upsert` with timestamp attributes mapped to another `field`: v6 overwrites supplied values with now; postgrelize keeps them.
- `$include.attr$` in a top-level `where` together with `limit`: postgrelize turns the limit subquery off (as `subQuery: false`) instead of producing invalid SQL; `limit` then counts joined rows.
- `describeTable` returns unquoted literal defaults (`it's` instead of `its`).

## Known, not fixed

- [#16929](https://github.com/sequelize/sequelize/issues/16929) `literal()` increments through `upsert`: inherent to the v6 `upsert` API. Use the `onConflict` option with `literal('"T"."balance" + EXCLUDED."balance"')` in `action.update`.
- [#11968](https://github.com/sequelize/sequelize/issues/11968) `upsert` does not restore soft-deleted paranoid rows (same as v6).
- [#11288](https://github.com/sequelize/sequelize/issues/11288) ordering by an included hasMany column with `limit` (same SQL as v6).
- [#12948](https://github.com/sequelize/sequelize/issues/12948) memory leak report: not reproduced.
- [#11146](https://github.com/sequelize/sequelize/issues/11146) the same association included twice under one alias (`separate: false` and `separate: true`) is not merged or rejected.
- v6 public names postgrelize lacks (statics such as `Sequelize.STRING` or the error classes, hook shorthands, some `Model` and `QueryInterface` methods) are tracked by a test against `sequelize@6` and listed in [API differences](./guide/migrating#api-differences); the list only shrinks.
- Not implemented v6 options: `create({ ignoreDuplicates })`, named / shared `ENUM` types.
