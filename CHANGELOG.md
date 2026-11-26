# Changelog

All notable changes to `postgrelize` are documented in this file.

The format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). From 1.0.0 a breaking change raises the major version, a new feature the minor version and a fix the patch version (before 1.0.0 a breaking change raised the minor version). Breaking changes are listed under **Breaking** and also under the usual heading.

Entries link the pull request and, for roadmap work, the stage name and the ADR or spec that describes it (specs and ADRs live in [`.10x/`](https://github.com/tormozz48/postgrelize/tree/main/.10x)). Until 0.12.0 the package was published as `@tormozz48/postgrelize` on GitHub Packages only.

## Stages and releases

| Stage                                                                           | Shipped in    | Pull requests                                                                                                                                                                                                                      | Spec / ADR                                         |
| ------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| M0 tooling, M1 core, M2 `ON CONFLICT`, M3 lifecycle, M4 associations, M5 schema | 0.1.0         | [#1](https://github.com/tormozz48/postgrelize/pull/1)–[#6](https://github.com/tormozz48/postgrelize/pull/6)                                                                                                                        | MVP design, ADR-001 to ADR-005, ADR-008 to ADR-010 |
| P1 PostgreSQL power (A query, B write, C connection, D schema)                  | 0.2.0         | [#8](https://github.com/tormozz48/postgrelize/pull/8)–[#11](https://github.com/tormozz48/postgrelize/pull/11)                                                                                                                      | P1 design                                          |
| CTE options, `copyTo`                                                           | 0.3.0         | [#13](https://github.com/tormozz48/postgrelize/pull/13)                                                                                                                                                                            | CTE and COPY design, ADR-013                       |
| Read replicas, nested creation                                                  | 0.4.0         | [#15](https://github.com/tormozz48/postgrelize/pull/15)                                                                                                                                                                            | Replication design, ADR-012, ADR-014               |
| `returningOld`, scopes of included models                                       | 0.5.0         | [#17](https://github.com/tormozz48/postgrelize/pull/17)                                                                                                                                                                            | RETURNING old design, ADR-015                      |
| Backlog 2: S1 README and coverage, S2 Sequelize issues review                   | 0.6.0         | [#20](https://github.com/tormozz48/postgrelize/pull/20), [#22](https://github.com/tormozz48/postgrelize/pull/22), [#23](https://github.com/tormozz48/postgrelize/pull/23)                                                          | Backlog 2 roadmap, S2 design, ADR-016              |
| Backlog 2: S3 docs site, S4 Effect core (steps 1 to 4)                          | 0.7.0         | [#24](https://github.com/tormozz48/postgrelize/pull/24)–[#26](https://github.com/tormozz48/postgrelize/pull/26), [#28](https://github.com/tormozz48/postgrelize/pull/28)                                                           | S4 design, ADR-017                                 |
| OOP rewrite (S4 stopped, Effect removed)                                        | 0.8.0         | [#29](https://github.com/tormozz48/postgrelize/pull/29)                                                                                                                                                                            | OOP rewrite design, ADR-018                        |
| Test isolation, contributor guide                                               | 0.8.1         | [#31](https://github.com/tormozz48/postgrelize/pull/31), [#32](https://github.com/tormozz48/postgrelize/pull/32)                                                                                                                   | ADR-019                                            |
| Backlog 3: S5 injection assurance                                               | 0.9.0         | [#34](https://github.com/tormozz48/postgrelize/pull/34)                                                                                                                                                                            | ADR-020                                            |
| Backlog 3: S6 refactor (a to g), public decorators                              | 0.9.0         | [#35](https://github.com/tormozz48/postgrelize/pull/35)–[#40](https://github.com/tormozz48/postgrelize/pull/40), [#42](https://github.com/tormozz48/postgrelize/pull/42), [#43](https://github.com/tormozz48/postgrelize/pull/43)  | S6 design, ADR-021, ADR-022                        |
| Backlog 3: S9 PostgreSQL coverage matrix                                        | 0.9.0         | [#41](https://github.com/tormozz48/postgrelize/pull/41)                                                                                                                                                                            | pg gap analysis                                    |
| Backlog 3: S7 coverage, S7b parity and robustness                               | 0.9.0         | [#44](https://github.com/tormozz48/postgrelize/pull/44), [#47](https://github.com/tormozz48/postgrelize/pull/47), [#48](https://github.com/tormozz48/postgrelize/pull/48), [#50](https://github.com/tormozz48/postgrelize/pull/50) | S7b design                                         |
| Backlog 3: S8 LLM docs and TSDoc                                                | 0.9.0         | [#46](https://github.com/tormozz48/postgrelize/pull/46), [#49](https://github.com/tormozz48/postgrelize/pull/49)                                                                                                                   | ADR-007                                            |
| Backlog 3: S10 performance                                                      | 0.9.0         | [#51](https://github.com/tormozz48/postgrelize/pull/51)–[#53](https://github.com/tormozz48/postgrelize/pull/53), [#55](https://github.com/tormozz48/postgrelize/pull/55)–[#57](https://github.com/tormozz48/postgrelize/pull/57)   | S10 design                                         |
| S16 session extras, named prepared statements                                   | 0.10.0        | [#61](https://github.com/tormozz48/postgrelize/pull/61), [#64](https://github.com/tormozz48/postgrelize/pull/64)                                                                                                                   | S16 design, ADR-023                                |
| Backlog 4: S14 types I                                                          | 0.10.0        | [#62](https://github.com/tormozz48/postgrelize/pull/62)                                                                                                                                                                            | S14 design                                         |
| Backlog 4: S12 set operations and FROM sources                                  | 0.10.0        | [#63](https://github.com/tormozz48/postgrelize/pull/63), [#65](https://github.com/tormozz48/postgrelize/pull/65), [#66](https://github.com/tormozz48/postgrelize/pull/66)                                                          | S12 design, ADR-024                                |
| S10b raw reads                                                                  | 0.10.0        | [#67](https://github.com/tormozz48/postgrelize/pull/67)                                                                                                                                                                            | S10b design                                        |
| Backlog 4: S11 DDL objects, S17 operator helpers                                | 0.11.0        | [#70](https://github.com/tormozz48/postgrelize/pull/70)–[#75](https://github.com/tormozz48/postgrelize/pull/75)                                                                                                                    | S11 design, ADR-025, S17 design                    |
| Backlog 4: S13 constraints, indexes, partitioning                               | 0.12.0        | [#78](https://github.com/tormozz48/postgrelize/pull/78), [#81](https://github.com/tormozz48/postgrelize/pull/81), [#82](https://github.com/tormozz48/postgrelize/pull/82), [#84](https://github.com/tormozz48/postgrelize/pull/84) | S13 design, ADR-027                                |
| Backlog 4: S15 types II                                                         | 0.12.0        | [#77](https://github.com/tormozz48/postgrelize/pull/77), [#79](https://github.com/tormozz48/postgrelize/pull/79), [#80](https://github.com/tormozz48/postgrelize/pull/80), [#83](https://github.com/tormozz48/postgrelize/pull/83) | S15 design, ADR-026                                |
| S16b feature examples enforcement                                               | 0.12.0        | [#85](https://github.com/tormozz48/postgrelize/pull/85), [#86](https://github.com/tormozz48/postgrelize/pull/86)                                                                                                                   | Feature examples design                            |
| Brand: logo (0.10.0), hero art and favicon                                      | 0.10.0, 1.0.0 | [#60](https://github.com/tormozz48/postgrelize/pull/60), [#88](https://github.com/tormozz48/postgrelize/pull/88)                                                                                                                   | none                                               |
| Backlog 5: distribution on npmjs.com (S18a)                                     | 1.0.0         | [#89](https://github.com/tormozz48/postgrelize/pull/89), [#90](https://github.com/tormozz48/postgrelize/pull/90)                                                                                                                   | Backlog 5 roadmap, ADR-028                         |

## [Unreleased]

### Fixed

- A cast suffix on a nested JSON `where` key (`{ meta: { 'level::integer': { [Op.gt]: 3 } } }`) casts the value like v6 instead of being part of the key name (which matched no rows); unknown cast types are rejected with `Invalid cast type`. Differential test in `tests/compat/json-where-cast.test.ts`; three v6 suite baseline entries and the cause `B-json-key-cast` are gone. ([#208](https://github.com/tormozz48/postgrelize/pull/208))
- `sequelize.json('col.list[0].name')` reads the array element like v6, in `attributes` and `where`, instead of treating `list[0]` as a key name. Differential test in `tests/compat/json-path-index.test.ts`; three v6 suite baseline entries and the cause `B-json-path-index` are gone. ([#209](https://github.com/tormozz48/postgrelize/pull/209))
- `{ id: { [Op.not]: [1, 2] } }` is `NOT IN` like v6, instead of comparing the column with an array. Differential test in `tests/compat/where-op-not-array.test.ts`; two v6 suite baseline entries and the cause `A-op-not-array` are gone. ([#214](https://github.com/tormozz48/postgrelize/pull/214))
- In a `sequelize.query` with `bind`, `$$` inside a string literal stands for `$` like v6 (it stayed doubled); dollar-quoted blocks are left as they are. Differential test in `tests/compat/bind-dollar-escape.test.ts`; two v6 suite baseline entries and the cause `C-bind-dollar-escape` are gone. ([#225](https://github.com/tormozz48/postgrelize/pull/225))
- The `fieldMap` option of `sequelize.query` renames the columns of SELECT rows like v6 (it was ignored). Differential test in `tests/compat/query-field-map.test.ts`; two v6 suite baseline entries and the cause `C-query-fieldmap` are gone. ([#226](https://github.com/tormozz48/postgrelize/pull/226))
- **Behaviour change:** `sequelize.query('SHOW ...')` without a `type` resolves to the rows alone, like v6, instead of `[rows, result]`. Differential test in `tests/compat/query-show-result.test.ts`; three v6 suite baseline entries (two of them filed under `C-client-min-messages`) and the cause `C-raw-show-result-shape` are gone. ([#226](https://github.com/tormozz48/postgrelize/pull/226))
- Parameters of a connection URI's query string that `pg` understands (`options`, `application_name`, `statement_timeout`, ...) and `host` are used like in v6 (they were ignored). Differential test in `tests/compat/connection-uri-options.test.ts`; one v6 suite baseline entry and the cause `C-uri-query-options` are gone. ([#228](https://github.com/tormozz48/postgrelize/pull/228))

## [1.9.8] - 2026-11-26

### Fixed

- The `typeValidation` Sequelize option works like in v6: a value that does not fit the data type of its attribute (a string for `INTEGER` or `DECIMAL`, an unknown `ENUM` label, ...) is rejected with `ValidationError` on writes and in `where` before the statement runs. Differential test in `tests/compat/type-validation.test.ts`; five v6 suite baseline entries and the causes `D-typevalidation-ignored` and `C-typevalidation-option` are gone. ([#205](https://github.com/tormozz48/postgrelize/pull/205))
- Includes of merged scopes and find options behave like v6: includes of different models are all kept (a non-array `include` replaced the other one) and entries of the same model and alias become one (the table was joined twice: `table name specified more than once`). Differential test in `tests/compat/scope-include-merge.test.ts`; five v6 suite baseline entries and the causes `A-scope-include-replaced` and `A-include-merge-same-model` are gone. ([#217](https://github.com/tormozz48/postgrelize/pull/217))
- When `save()` writes the changed attributes, a new value that a `beforeUpdate` hook gives to any of them is validated again, like v6; an invalid value set by a hook on an attribute that was already changed was saved. Differential test in `tests/compat/hook-changes-revalidated.test.ts`; two v6 suite baseline entries and the cause `B-hook-changes-not-revalidated` are gone. ([#218](https://github.com/tormozz48/postgrelize/pull/218))
- A `Date` in a nested JSON `where` is compared as `timestamptz` like v6 (it was bound as quoted JSON text and never matched), and `IN` / `BETWEEN` on a JSON path cast by the type of their values. Differential test in `tests/compat/json-date-where.test.ts`; one v6 suite baseline entry and the cause `B-json-date-where` are gone. ([#205](https://github.com/tormozz48/postgrelize/pull/205))
- **Behaviour change:** like v6, a hook in the model options replaces the `define.hooks` hook of the same name instead of running after it. Differential test in `tests/compat/define-hooks-override.test.ts`; one v6 suite baseline entry and the cause `D-define-hooks-merge` are gone. ([#229](https://github.com/tormozz48/postgrelize/pull/229))

## [1.9.7] - 2026-11-26

### Fixed

- The `getterMethods` and `setterMethods` model options work like in v6: virtual getters run on `instance.name`, `get()` and `toJSON()` (instances loaded by a query do not list them), virtual setters run on `build` and `set`, attribute getters and setters take precedence, and getters receive `(key, options)`. The types `ModelGetterOptions` and `ModelSetterOptions` are exported. Differential test in `tests/compat/getter-setter-methods.test.ts`; four v6 suite baseline entries and the cause `B-getter-setter-methods` are gone. ([#200](https://github.com/tormozz48/postgrelize/pull/200))
- **Behaviour change:** like v6, `instance.set` / `update` no longer change a primary key that already has a value, nor `createdAt`, `updatedAt`, `deletedAt` and the version attribute of a persisted record (`setDataValue` and custom setters still do). Differential test in `tests/compat/read-only-attributes.test.ts`; four v6 suite baseline entries and the cause `B-set-readonly-pk-timestamps` are gone. ([#200](https://github.com/tormozz48/postgrelize/pull/200))
- `Model.rawAttributes` (and `getAttributes()`) is one mutable object like in v6: attributes added, changed or deleted there take effect after `refreshAttributes()` or the next association instead of being lost. Differential test in `tests/compat/raw-attributes-mutation.test.ts`; four v6 suite baseline entries and the cause `D-rawattributes-copy` are gone. ([#203](https://github.com/tormozz48/postgrelize/pull/203))
- `instance.increment` / `decrement` work like in v6: the instance takes the new values from the returned row (not with `returning: false`), and `options.where` is added to the primary key condition (it was ignored, so the row changed even when it did not match). Differential test in `tests/compat/increment-instance.test.ts`; three v6 suite baseline entries and the cause `B-increment-instance` are gone. ([#206](https://github.com/tormozz48/postgrelize/pull/206))
- `increment` and `decrement` of a model with optimistic locking (`version`) raise the version column by one, like v6. Differential test in `tests/compat/increment-version.test.ts`; two v6 suite baseline entries and the cause `B-increment-version` are gone. ([#207](https://github.com/tormozz48/postgrelize/pull/207))
- `rejectOnEmpty` works like in v6: `findAll` honours it too, the model option is the default of every finder, and an error class is instantiated (an error instance is thrown as it is). Differential test in `tests/compat/reject-on-empty.test.ts`; the v6 suite baseline entries of the cause `B-rejectOnEmpty-findall` are gone (one now waits for `D-error-ctor-no-args`). ([#200](https://github.com/tormozz48/postgrelize/pull/200))
- `instance.set('meta.city', value)` on a JSON / JSONB attribute writes the nested key and marks the attribute changed, like v6 (it was ignored). Paths through `__proto__`, `constructor` or `prototype` are ignored. Differential test in `tests/compat/json-nested-set.test.ts`; three v6 suite baseline entries and the cause `D-json-nested-set` are gone. ([#200](https://github.com/tormozz48/postgrelize/pull/200))
- **Behaviour change:** like v6, `instance.update(values)` saves only the passed keys (and what their setters and the hooks change), not other unsaved changes of the instance; those stay in `changed()`. Differential test in `tests/compat/update-passed-only.test.ts`; one v6 suite baseline entry and the cause `B-update-saves-all-changed` are gone. ([#219](https://github.com/tormozz48/postgrelize/pull/219))
- A timestamp attribute declared with a `defaultValue` takes it instead of the current time on create, bulk create, save, update and upsert, like v6 (a declared `updatedAt` default was overwritten). Differential test in `tests/compat/timestamp-default-value.test.ts`; one v6 suite baseline entry and the cause `B-updatedat-default` are gone. ([#220](https://github.com/tormozz48/postgrelize/pull/220))
- `literal(2020)` with a number renders that number, like v6: it became `DEFAULT NULL` in `sync` and `NULL` in inserts, so an attribute with such a default stayed `null`. Differential test in `tests/compat/literal-default-returned.test.ts`; two v6 suite baseline entries and the cause `B-literal-default-not-returned` are gone. ([#221](https://github.com/tormozz48/postgrelize/pull/221))
- `instance.set()` of a built instance with `include` builds the nested instances from the data of an included association, also with `raw: true`, and `get(..., { plain: true })` returns plain objects for them, like v6 (the data was ignored). Differential test in `tests/compat/instance-set-include.test.ts`; three v6 suite baseline entries and the cause `B-instance-set-include` are gone. ([#200](https://github.com/tormozz48/postgrelize/pull/200))
- `Model.removeAttribute('id')` leaves a model without a primary key, like v6 (the generated `id` stayed the primary key), and `Model.primaryKeys` exists. Differential test in `tests/compat/remove-attribute-pk.test.ts`; one v6 suite baseline entry and the cause `D-remove-attribute-pk` are gone. ([#230](https://github.com/tormozz48/postgrelize/pull/230))
- A string or number assigned to a `DATE` attribute becomes a `Date` like in v6 (`'infinity'` stays an infinity), so a number saved by `create` or `update` is no longer bound as `bigint`. Differential test in `tests/compat/set-date-sanitize.test.ts`; one v6 suite baseline entry and the cause `D-set-date-string-null` are gone. ([#200](https://github.com/tormozz48/postgrelize/pull/200))

## [1.9.6] - 2026-11-26

### Fixed

- Association getters and counters (`getX`, `countXs`) honour the `scope` option like v6: `false` removes the default scope of the target, a name (or list of names) replaces it. Differential test in `tests/compat/association-getter-scope.test.ts`; eight v6 suite baseline entries and the cause `A-getter-scope-option` are gone. ([#198](https://github.com/tormozz48/postgrelize/pull/198))
- `value instanceof DataTypes.X` works like with the v6 classes (including the base types, e.g. a `BIGINT` is an `INTEGER` and a `NUMBER`), `String(DataTypes.X)` is the type name so types can be object keys, and the `keyType` association option sets the data type of the generated foreign key (it was ignored). Differential test in `tests/compat/data-type-instanceof.test.ts`; six v6 suite baseline entries and the cause `A-datatype-instanceof` are gone. ([#199](https://github.com/tormozz48/postgrelize/pull/199))
- A foreign key attribute the model already declares gets the association's `references`, `onDelete` and `onUpdate` like v6 (declared values win), and `foreignKey` may be an existing attribute (`Model.rawAttributes.x`) or carry `defaultValue`. **Behaviour change:** `sync()` now creates the foreign key constraint for such columns. Differential test in `tests/compat/foreign-key-existing-attribute.test.ts`; the cause `A-fk-existing-attribute-not-merged` is gone (its v6 titles still differ only in the shape of `references.model`, cause `A-references-model-object`). ([#199](https://github.com/tormozz48/postgrelize/pull/199))
- `association.get(instances, { limit, order })` returns up to `limit` rows for each source instance, like v6, instead of applying the limit to the whole result. Differential test in `tests/compat/association-get-limit.test.ts`; two v6 suite baseline entries and the cause `A-association-get-limit` are gone. ([#198](https://github.com/tormozz48/postgrelize/pull/198))
- `addX` / `setX` of a `belongsToMany` association update the through attributes of rows that already exist (also inside a transaction) like v6, and take the junction values set on an item (`task.UserTask = {...}`). **Behaviour change:** these values were silently dropped for existing rows. Differential test in `tests/compat/btm-through-update.test.ts`; two v6 suite baseline entries and the cause `A-btm-add-existing-no-update` are gone. ([#213](https://github.com/tormozz48/postgrelize/pull/213))
- `setX`, `addX`, `removeX` and `hasX` of `hasMany` and `setX` of `hasOne` no longer apply the default scope of the target, like v6: rows outside the scope were silently left linked or unlinked. Differential test in `tests/compat/association-write-default-scope.test.ts`; one v6 suite baseline entry and the cause `A-hasmany-write-applies-default-scope` are gone. ([#215](https://github.com/tormozz48/postgrelize/pull/215))
- A junction model created from a name takes `timestamps` (and the timestamp names, `underscored`, `schema`) from the `belongsToMany` options and `paranoid` from `through`, like v6 (`timestamps: false` still added `createdAt` / `updatedAt`). Differential test in `tests/compat/btm-through-options.test.ts`; one v6 suite baseline entry and the cause `A-btm-timestamps-option` are gone. ([#216](https://github.com/tormozz48/postgrelize/pull/216))

## [1.9.5] - 2026-11-26

### Fixed

- Separate includes match v6: a `hasMany` include with `limit` and no `separate` is loaded with its own query (the limit was ignored and every child returned); a `separate` include whose parent `attributes` leave out the source key, or whose own `attributes` leave out the foreign key, still finds its children (the key is selected for matching and the foreign key is not left in the result); a `separate` include nested in another `separate` include keeps its `order` and `limit`; the `logging` option reaches the queries of separate includes. Differential tests in `tests/compat/include-separate.test.ts`; ten entries leave the v6 suite baseline (`include` area: four causes gone, the other twelve causes of the area remain).
- Nested creation (`Model.create(values, { include })`) hands the options of the include entry (`include: [{ model: User, myOption: 'x' }]`) and the `parentRecord` to the hooks of the nested records, like v6. Differential test in `tests/compat/include-create-options.test.ts`; three entries leave the v6 suite baseline.
- Include errors fixed to match v6: with `limit` or `findOne` (sub-query form), a model whose primary key, foreign key or ordered attribute has a different column name (`field`) no longer fails with `column ... does not exist`; a bare `literal()` in the `attributes` of an include or a model no longer throws `item is not iterable` (and an unmatched LEFT JOIN does not make a phantom child from a selected literal); `include: [{ all: 'BelongsTo' }]` (types `BelongsTo`, `HasOne`, `HasMany`, `One`, `Has`, `Many`, `All`), `nested: true`, extra options on an `all` entry and an explicit include of a model also covered by `all` work like v6; `order: [[Include, ThroughModel, 'attr']]` orders by a junction column; `as: { singular }` / `{ plural }` resolves the association. Differential tests in `tests/compat/include-renamed-fields.test.ts` and `tests/compat/include-all-and-aliases.test.ts`; fifteen entries and four causes leave the v6 suite baseline.
- An invalid include element (`include: [1]`, `[null]`, `{ model: null }`, `{ association: null }`, `{}`) throws v6's `Include unexpected. Element has to be either a Model, an Association or an object.` instead of a raw `TypeError` or `Model is not initialized`. Differential test in `tests/compat/include-all-and-aliases.test.ts`; one entry and one cause leave the v6 suite baseline.
- Include results match v6: an include with `attributes: []` leaves its property out of the instance instead of an empty array (`kingdom.Animals`); a find with `attributes` and an include selects the primary key to tell joined rows apart (rows with equal attribute values were merged into one) and keeps it out of the result; a foreign key added for the sub-query joins (`limit` with `belongsTo` and `hasMany` includes) no longer leaks into the result. Differential tests in `tests/compat/include-all-and-aliases.test.ts`; five entries and three causes leave the v6 suite baseline.
- `Model.bulkCreate(records, { include })` creates the nested records the way v6 does: one nested `bulkCreate` per include (belongsTo parents, then the rows, then hasOne / hasMany / belongsToMany children and the junction rows) instead of a `save` per row, so the `beforeBulkCreate` / `afterBulkCreate` hooks of the nested models fire and receive the include entry options (`myOption`) and `transaction` / `logging`. **Behaviour change:** nested `bulkCreate` no longer runs the per-row `beforeCreate` / `afterCreate` hooks (pass `individualHooks: true` for those), as in v6. Differential test in `tests/compat/include-create-options.test.ts`; three entries and the cause `B-include-option-propagation` leave the v6 suite baseline.

## [1.9.4] - 2026-11-25

### Fixed

- **Data loss:** `hasMany` `setX` and `hasOne` `setX` respect the association `scope`. `setX` on a `hasMany` with `scope` (a polymorphic association) no longer sets the foreign key of rows of another scope to `NULL` (for example comments of a post sharing the id of a question); `hasOne` `setX` looks up the current row inside its scope, so it no longer unlinks an unrelated row and the old scoped row is replaced. Tests in `tests/compat/association-set-scope.test.ts`; two entries leave the v6 suite baseline.
- **Data loss:** `Model.increment` / `Model.decrement` now apply the active scope like v6: `Model.scope('x').increment(...)` (and a default scope) changed every row matching only the explicit `where`, ignoring the scope's `where`. Without a `where` (no options, or options without `where`, and no scope `where`) they now reject with an `AssertionError` ("Missing where attribute in the options parameter") instead of running `UPDATE` on all rows; `where: {}` still changes every row. Tests in `tests/compat/increment-scope-where.test.ts`; two baseline causes of the v6 suite (`B-increment-scope-ignored`, `D-increment-no-where`) are gone.
- A bare number or bigint as `where` is a primary key lookup like in v6: `findOne({ where: 1 })`, `findAll`, `count` filter the first primary key attribute instead of failing with `Invalid where value`. `destroy` and `update` with such a `where` are rejected with v6's `Expected plain object, array or sequelize method in the options.where parameter` message, and a string `where` gives v6's `Support for `{where: 'raw query'}` has been removed.` On a `paranoid` model v6 silently ignored the number and matched every live row; postgrelize filters by the key (ADR-016). Differential test in `tests/compat/where-pk-shorthand.test.ts`; one `scripts/v6-suite/baseline.json` entry removed.

## [1.9.3] - 2026-11-25

### Fixed

- Soft delete (`paranoid`) matches v6 in five places: `Model.destroy({ truncate: true })` soft-deletes the rows instead of emptying the table (only `force: true` truncates); destroying an already soft-deleted instance keeps its first `deletedAt`; a `deletedAt` attribute with a truthy `defaultValue` (for example `new Date(0)` or `Infinity`) marks "not deleted" in finders, includes, `destroy`, `restore` and `isSoftDeleted`; the through model of a `belongsToMany` include hides its soft-deleted junction rows; a `DATE` default of `Infinity` / `-Infinity` is created by `sync`. Also the v6 messages for a string in a `where` array and for a `createdAt` / `updatedAt` / `deletedAt` option that is neither a string nor a boolean. A row created with `deletedAt: -Infinity` is no longer stored as `Infinity` (v6 did). Parity audit, tests in `tests/compat/paranoid-parity.test.ts`.

## [1.9.2] - 2026-11-25

### Fixed

- The data types are callable and constructable like in v6: `DataTypes.INTEGER(11)`, `DataTypes.BIGINT({ length: 20 })`, `new DataTypes.INTEGER()`, `DataTypes.SMALLINT.UNSIGNED.ZEROFILL()`, `DataTypes.UUID()`, `new DataTypes.JSONB()`, `DataTypes.DOUBLE(10, 2)` (also `TINYINT`, `MEDIUMINT`, `REAL`, `BOOLEAN`, `TIME`, `DATEONLY`, `CITEXT`, `INET`, `CIDR`, `MACADDR`, `TSVECTOR`, `HSTORE`, `JSON`); they were not, and calling `DataTypes.INTEGER(11)` threw. The arguments are recorded in `type.options` and PostgreSQL ignores them, as in v6; `UNSIGNED` / `ZEROFILL` record a flag in `options` (still no effect on the column). The calls return the `DataTypes.<X>DataType` interface types. The bare `DataTypes.STRING` and similar types now have `toSql()` too, as their types already claimed. ([#182](https://github.com/tormozz48/postgrelize/pull/182))

## [1.9.1] - 2026-11-25

### Fixed

- The queries of models, instances and the `QueryInterface` run through `sequelize.query`, like v6, so a wrapper or an override of `sequelize.query` sees the SQL of every statement (it bypassed the method before, going to the connection manager directly). The statement arrives as a string with the bound values in `options.bind`; a wrapper has to hand the options on unchanged. See [Wrapping `sequelize.query`](https://tormozz48.github.io/postgrelize/guide/connection#wrapping-sequelize-query). ([#183](https://github.com/tormozz48/postgrelize/pull/183))

### Changed

- Regression tests pin that, with `Sequelize.useCLS()` (AsyncLocalStorage or a namespace), the hooks of `findAll` / `findOne` / `findByPk` / `count` / `create` / `bulkCreate` / `update` / `destroy` / `upsert` / `restore` / aggregates and of the instance `save` / `update` / `destroy` / `reload` receive the ambient transaction in `options.transaction`, like v6; a follow-up query in an `afterFind` hook with it sees the uncommitted rows. This already worked in 1.9.0; an explicit `transaction: null` is respected. ([#183](https://github.com/tormozz48/postgrelize/pull/183))

## [1.9.0] - 2026-11-25

### Added

- The `DataTypes.<X>DataType` interface family of Sequelize v6 is exported as types through `DataTypes` (`DataTypes.DecimalDataType`, `StringDataType`, `IntegerDataType`, `EnumDataType<T>`, `ArrayDataType<T>`, … and their `...DataTypeOptions`), so `(type: DataTypes.DecimalDataType) => type.options.scale` compiles like in v6. The data types carry the matching runtime members: `options` (the arguments the type was created with), `toSql()`, and on `VIRTUAL` `returnType` / `fields`. Members postgrelize does not provide (`dialectTypes`, `stringify`, `validate`, `BINARY`, `escape`) are not declared, and v6 has no `JSON` / `UUID` / `JSONB` data type interfaces. ([#180](https://github.com/tormozz48/postgrelize/pull/180))

## [1.8.5] - 2026-11-25

### Fixed

- The table alias of a query (main table and includes) follows the model's current `Model.name`, like v6, which reads it whenever it builds a query: a class renamed after `init` (a bundler, a test redefining `name`) still emits the alias raw SQL fragments built from `Model.name` refer to. ([#178](https://github.com/tormozz48/postgrelize/pull/178))

## [1.8.4] - 2026-11-24

### Fixed

- `instance.reload()` of an instance reached through nested includes (a `hasMany` child, a `belongsTo` of a child, …) loads that instance's own includes again, like v6 (`_options.include` of a nested build); 1.8.3 did this only for an instance a finder returned itself. ([#176](https://github.com/tormozz48/postgrelize/pull/176))

### Changed

- The `logging` callback receives the SQL with the values inlined as literals (first argument), like v6, so a logged statement can be run as it is; the statement sent to PostgreSQL keeps its bound parameters. The second argument is `{ bind, parameterizedSql }` (the bound values and the statement as sent; `parameterizedSql` is a postgrelize extension). The default `console.log` logger therefore prints the values of `INSERT` / `UPDATE` statements too: set `logging: false` or a logger that redacts where that matters. ([#176](https://github.com/tormozz48/postgrelize/pull/176))

## [1.8.3] - 2026-11-24

### Fixed

- `instance.reload()` without options loads again the `include` the instance was loaded with by a finder, like v6 (`_options.include`); the loaded association was gone after `reload()`. ([#172](https://github.com/tormozz48/postgrelize/pull/172))
- `WhereOptions<T>` never infers `T` from the attribute conditions, like v6, so a generic helper `scope<T>(where: WhereOptions<T>)` can feed a typed `where` (`findAll({ where: scope({ type: { [Op.in]: types } }) })`), and a where value may be `undefined` in the types under `exactOptionalPropertyTypes` (the runtime still throws, like v6). ([#172](https://github.com/tormozz48/postgrelize/pull/172))

## [1.8.2] - 2026-11-24

### Fixed

- `changed(key, value)` has the two-argument overload `changed<K extends keyof this>(key: K, value: boolean)` of the v6 typings; it was found by the new generated type-call tests ([#170](https://github.com/tormozz48/postgrelize/pull/170)).

### Changed

- Generated API calls (unions, `null`, `keyof M`, generic helpers, subclasses) and sample-value acceptance checks for `WhereOptions` and `update` values are compared with v6 too, and `noUncheckedIndexedAccess` joins the compiler-flag matrix of the type-parity tests ([#170](https://github.com/tormozz48/postgrelize/pull/170)).

## [1.8.1] - 2026-11-24

### Fixed

- Regressions of 1.8.0 found by the nightly v6 suite: `instance.update()` after `create(…, { fields })` no longer fails with an `undefined` primary key, a stamped `updatedAt` reaches the instance again, `update(values, { fields })` assigns only the listed attributes (custom setters excepted), and `Model.update({ individualHooks: true })` returns the instances its hooks worked on. The v6 suite baseline drops the 12 entries that now pass.
- `instance.reload({ include })` replaces an association instance the caller assigned earlier with the freshly loaded row, and drops values the fresh row no longer holds unless `attributes` limits the reload (v6 `reset`). Compat tests also pin that `instance.update()` leaves the written `updatedAt` on the instance and that `Model.name` equals `modelName` for a renamed class.
- Types now match Sequelize v6 where ddt hit gaps: `Model.update` accepts a value of a union of attribute interfaces (`UpdateValues` no longer distributes over the union), `changed(key)` accepts `keyof M` in generic code, `Model.primaryKeyAttribute` is typed `string`, and a `WhereOptions` variable initialised with `{}` accepts `where.name = …` (logic operators are separate members that require their operator).

### Changed

- Type-parity tests now also compile the corpus under other compiler flags, and `npm run types:consumer` compiles a Sequelize v6 project against v6 and against postgrelize and lists the errors only postgrelize reports.

## [1.8.0] - 2026-11-24

### Fixed

- `instance.update()` / `save()` send no `RETURNING` data back into the instance, like v6: it keeps its in-memory values (`'08:30'` for a `TIME` column, so `afterUpdate` hooks see what the caller assigned, not `'08:30:00'`; a column a hook decrypted stays decrypted after a paranoid `destroy()`); only columns written from `fn` / `literal` and generated columns take the value PostgreSQL computed. ([#165](https://github.com/tormozz48/postgrelize/pull/165))
- `beforeFindAfterExpandIncludeAll` hooks receive `{ association }` includes already resolved to `model` and `as` (and `{ all: true }` expanded), like v6. ([#165](https://github.com/tormozz48/postgrelize/pull/165))
- An association value assigned to an instance (`b.form.transport = b`) is a plain property, not one of its values, like v6: `get({ plain: true })` and `toJSON()` follow only the includes the query loaded and no longer overflow the stack on a cycle. ([#165](https://github.com/tormozz48/postgrelize/pull/165))
- `Model.name` equals the `modelName` init option when the model has no `beforeDefine` hook (it stayed the class name, e.g. `File$1` from a bundler), like v6, so SQL built from `Model.name` matches the table alias. ([#165](https://github.com/tormozz48/postgrelize/pull/165))
- `instance.update(values)` ignores keys whose value is `undefined`, like v6, instead of validating them as `null`. ([#165](https://github.com/tormozz48/postgrelize/pull/165))
- `ValidationErrorItem.original` holds what a custom (attribute or model) validator threw, like v6, so callers can tell their own error class apart. ([#165](https://github.com/tormozz48/postgrelize/pull/165))
- `instance.update(values)` / `save()` with nothing changed runs validation and the `beforeUpdate` / `beforeSave` hooks before returning, like v6, so a hook can still change the write or veto it; no query runs when nothing ends up changed. ([#165](https://github.com/tormozz48/postgrelize/pull/165))
- `findAll` with `include` returns every row when no include is a multi-association (`hasMany`, `belongsToMany`), like v6: rows with equal selected values are no longer collapsed when the primary key is not selected. With a multi-association include rows are still grouped (by primary key, else by the selected values). ([#165](https://github.com/tormozz48/postgrelize/pull/165))
- `ForeignKeyConstraintError.fields` and `ExclusionConstraintError.fields` keep what the caller passed (an object stays an object, no value is `undefined`), like v6; they were turned into arrays of keys. ([#165](https://github.com/tormozz48/postgrelize/pull/165))
- `WhereOptions<T>` no longer infers `T` from the conditions under `Op.and` / `Op.or` / `Op.not`, so generic helpers such as `applyScope<T>(where: WhereOptions<T>)` type-check when called with `{ [Op.or]: [...] }`. ([#165](https://github.com/tormozz48/postgrelize/pull/165))

### Added

- `FindOptions.tableAs` (a v6 option missing from its typings) aliases the main table in `FROM`; it is ignored when `include` is set. ([#165](https://github.com/tormozz48/postgrelize/pull/165))

## [1.7.0] - 2026-11-24

### Fixed

- `Model.update` sets `options.fields` (the attributes in `values`, plus `updatedAt`) and `options.attributes` (the values with the new `updatedAt`) before the `beforeBulkUpdate` hooks, like v6; an explicit `fields` option is kept, and a hook that changes `fields`, `attributes` or `individualHooks` takes effect ([#162](https://github.com/tormozz48/postgrelize/pull/162)).
- In `afterCreate` / `afterUpdate` / `afterSave` hooks the instance still reports its pre-save state (`changed()`, `previous(key)`), like v6: previous values and change tracking are reset after the after hooks (with a `fields` option only for the saved fields); `isNewRecord` is already `false` there. With `individualHooks`, a bulk `update` runs `afterUpdate` on the instances `beforeUpdate` saw (changed, with the new `updatedAt`) unless `returning` or row-by-row saves apply ([#162](https://github.com/tormozz48/postgrelize/pull/162)).
- `[Op.or]` / `[Op.and]` with a plain-object value join its entries with OR / AND like v6 (`_whereGroupBind`); `{ owner: { [Op.or]: { [Op.is]: null, [Op.eq]: 5 } } }` was `IS NULL AND = 5` and returned no rows ([#162](https://github.com/tormozz48/postgrelize/pull/162)).
- A `required: true` include nested under a non-required include is joined inside the parent's parenthesised `LEFT OUTER JOIN ( ... )` like v6, so root rows whose optional parent is empty are kept (it was a top-level `INNER JOIN` that dropped them). With `limit` and a multi-association parent, the root `EXISTS` filter also applies when a direct child is required, as v6 `subQueryFilter` ([#162](https://github.com/tormozz48/postgrelize/pull/162)).
- String arguments of `fn()` are written into the SQL as escaped literals like Sequelize v6 (`COUNT('*')`, `concat_ws(' ', ...)`, `to_char(..., 'YYYY')`) instead of bound parameters, which PostgreSQL could not type; the postgrelize helpers (`trigramSimilarity`, text search) keep binding their strings ([#161](https://github.com/tormozz48/postgrelize/pull/161)). ADR-038.
- `Op.is` accepts a `literal()` or any other value, rendered like v6 (`IS NULL`, `IS 5`), instead of throwing; `WhereOperators` types `[Op.is]` as `boolean | null | Literal` ([#161](https://github.com/tormozz48/postgrelize/pull/161)). ADR-038.
- `col('a.b.c')` with three or more parts renders `"a->b"."c"` (include alias path) like v6, instead of three identifiers ([#161](https://github.com/tormozz48/postgrelize/pull/161)).
- The `get` / `set` of an attribute definition have the model instance as `this` (`ModelAttributes<M, TAttributes>` and `AttributeOptions<M>` take the model type, as in v6 types) ([#161](https://github.com/tormozz48/postgrelize/pull/161)).
- Option types of the finders and writers (`FindOptions`, `UpdateOptions`, `DestroyOptions`, `SaveOptions`, `CreateOptions`, `BulkCreateOptions`, ...) have mutable keys, so `options.where = ...` and `{ ...options, paranoid: false }` compile as in v6 ([#161](https://github.com/tormozz48/postgrelize/pull/161)).

## [1.6.0] - 2026-11-23

### Changed

- Finder `replacements` (`literal()` with `:name` / `?` in `findAll`, `count`, `findByPk`, `update`, ...) are written into the SQL as escaped literals like Sequelize v6, instead of one bound parameter per occurrence; a placeholder used in `SELECT` and `GROUP BY` now produces identical expressions. Narrow exception to ADR-002, extends ADR-036 (ADR-037).
- `Json` and `json()` take `string | number | boolean | null` as value, as in v6 types.
- `DataTypeInput` also accepts a raw PostgreSQL type name (`{ type: 'vector(384)' }`), as `DataType` of v6 does.

### Added

- `sequelize.getQueryInterface().queryGenerator.selectQuery(tableName, options, model)` renders finder options to SQL text (values as escaped literals, ends with `;`), as v6; no scope, paranoid filter or hook is applied.

### Fixed

- `get({ plain: true })`, `get()` and `toJSON()` include every attribute with a custom getter, also VIRTUAL ones without a stored value, as in Sequelize v6.
- `order: [[Model.association, 'id', 'ASC']]` accepts an association instance as the first item (`findAll`, `reload`); it threw `Invalid order direction: id`.
- `where: { '$user.agent.id$': ... }` with more than two path parts addresses the nested include alias `"user->agent"."id"`, as v6.
- A finder value beyond the `int4` range (`findByPk(99999999999)`) compares as a `bigint` and finds nothing instead of failing with `out of range for type integer`.
- `instance.validate()` resolves with the instance at runtime, as v6 (declared `Promise<void>`).
- A column option object with a string `type` (`{ type: 'varchar(5)' }`) is read as column options.
- Type parity with Sequelize v6: plain strings, numbers, booleans and dates are accepted for narrow columns in `where` (enums, unions, `Date | null`, `[Op.between]` with a `string[]`); `WhereOptions<T>` accepts a top-level `{ [Op.and]: [...] }`; `Model#previous` has the v6 overloads; `SaveOptions` without argument is assignable to `SaveOptions<Attrs>`; `sequelize.transaction` callbacks return `PromiseLike<T>`, which keeps the contextual return type.

## [1.5.0] - 2026-11-23

### Changed

- `sequelize.query` writes `replacements` (`:name` and `?`) into the SQL text as escaped literals through the shared `SqlLiteral` escaper, as Sequelize v6 does, instead of binding them as `$n` parameters. A query with several `;`-separated statements and replacements now runs (before: `cannot insert multiple commands into a prepared statement`). `bind` and the replacements of the finders stay bound; a string with a NUL character throws. This is a deliberate, narrow exception to always-bound values; payload and property tests cover the escaper. v6 gap H, ADR-036.

### Added

- `dialectModule` constructor option, accepted for Sequelize v6 type compatibility (postgrelize always loads `pg` and ignores it).

### Fixed

- An explicit `undefined` no longer overrides an attribute default: `Model.build({ s: undefined })`, `create` and `upsert` use `defaultValue` like Sequelize v6 instead of failing a `NOT NULL` constraint.
- A function `defaultValue` is called once per new row and its result used, as in Sequelize v6 (`build`, `create`, `bulkCreate`, `findOrCreate`); it threw `DataCloneError` before. `sync` no longer renders the function source as a `DEFAULT` clause.
- `Model.count({ group })` is typed as `GroupedCountResultItem[]` (v6 overloads), so `rows.map((r) => r.count)` type-checks; the ungrouped call stays `number`. `CountWithOptions` is exported. Runtime unchanged. Part of the Sequelize v6 type-parity work (ADR-032).
- Type parity with Sequelize v6: `IncludeOptions` and the `fields` option of `SaveOptions` / `UpdateOptions` are mutable (hooks and helpers can assign `include.required`, `options.fields`, …); `Model.max` / `Model.min` take `<T, M>` in the v6 order, so `max<string | null, MyModel>('name')` compiles; `validate` model functions are typed with `this` as the model instance, so `this.otherAttribute` and `this: MyModel` both compile.
- `Model.update` types follow v6: with `returning: true` the result is `[affectedCount, affectedRows]` (rows no longer optional), otherwise `[affectedCount]`. Part of the Sequelize v6 type-parity work (ADR-032).
- `Order` is `Fn | Col | Literal | OrderItem[]` as in Sequelize v6 instead of collapsing to `unknown`, so `const order: Order = []; order.push(['id', 'ASC'])` type-checks. Part of the Sequelize v6 type-parity work (ADR-032).
- `WhereOptions<A | B>` no longer distributes over a union model: like v6 it keys on the attributes the members share, so `{ type: ['a', 'c'] }` type-checks when `type` is `'a' | 'b'` on `A` and `'c'` on `B`. Part of the Sequelize v6 type-parity work (ADR-032).
- VIRTUAL attributes as in Sequelize v6: `Model.update` never writes a virtual attribute (it used to fail with `column "x" does not exist`) and, with `sideEffects` (default `true`), also updates the attributes the setter of a virtual attribute changes (`sideEffects: false` turns this off); `DataTypes.VIRTUAL(type, ['a', 'b'])` dependencies are used: a query that selects the virtual attribute selects `a` and `b` instead of a non-existent column. Found by the v6 suite harness; differential tests.
- Finished transactions as in Sequelize v6: a query on a transaction that was committed or rolled back (or whose `commit()` / `rollback()` is already running) is rejected with `commit|rollback has been called on this transaction(<id>), you can no longer use it. (The rejected query is attached as the 'sql' property of this error)` and the error has `sql`, instead of `Transaction has not started` or running; `transaction.afterCommit(fn)` throws `"fn" must be a function` for anything else. Found by the v6 suite harness; differential tests.
- `instance.destroy()` of a paranoid model (soft delete) and `instance.restore()` resolve with the instance, as in Sequelize v6 (they resolved with nothing); a hard `destroy()` still resolves with nothing (v6 resolves with `[]`). The declared type stays `Promise<void>`. Found by the v6 suite harness; differential test.
- A model that declares `createdAt` / `updatedAt` itself with `allowNull: false` (typically with a custom `field`) can create records: the timestamps of a new record are set before validation, as in Sequelize v6; before, `create`, `save` and `bulkCreate` failed with `notNull Violation: createdAt cannot be null`. Found by the v6 suite harness; differential test.
- Association API as in Sequelize v6: defining an association whose alias is the name of an attribute of the source model throws `Naming collision between attribute 'x' and association 'x' on model M. To remedy this, change either foreignKey or as in your association definition` (it used to shadow the attribute); `hasMany.get(instances)` and `hasOne.get(instances)` load the rows of several source instances with one query and return an object keyed by the source key (arrays for `hasMany`, an instance or `null` for `hasOne`). Found by the v6 suite harness; differential tests.

## [1.4.0] - 2026-11-23

Sequelize v6 parity part four: cascade hooks, hook semantics, `sequelize.query` statements and error messages, and the v6 guards against writes without `where`; breaking only for code that relied on those guards missing.

### Added

- Cascade hooks, as in Sequelize v6: an association with `onDelete: 'CASCADE'` and `hooks: true` loads its rows and destroys each with its own `beforeDestroy` / `afterDestroy` hooks when the owner instance is destroyed (a real delete, not the soft delete of a paranoid model); an error in a hook stops the destroy. This replaces the documented limitation that `hooks` was accepted and ignored. `association.options` is public, as in v6. Found by the v6 suite harness; differential tests.
- `IncludeOptions.on` (custom `ON` condition of an include join, as in v6), `AssociationOptions.hooks` (accepted for v6 typing; the cascade runs in PostgreSQL), `QueryInterface#queryGenerator` (typed `unknown` like v6), the `LOCK` type next to the `LOCK` value, `GroupedCountResultItem`, `instance.update(key, value)`, and `fn` / `col` / `literal` values for `Model.update`, `Model.updateStatement` and `instance.update`. Part of the Sequelize v6 type-parity work ([#133](https://github.com/tormozz48/postgrelize/pull/133), ADR-032).
- `Model#get(key: string)` overload and `get<K extends keyof this>(key)` like v6, so included associations and model getters type-check.

### Changed

- `findAndCountAll` has the v6 overloads: `count` is a number, or an array of `GroupedCountResultItem` when `group` is given. `ConstraintErrorOptions.parent` is optional, and `LoggingFunction` is `(sql: string, timing?: number) => void` as in v6.

### Fixed

- Guards of Sequelize v6 against writes and reads that match more than intended: `Model.update` without `where` throws `Missing where attribute in the options parameter`; `Model.destroy` without `where` (and without `truncate: true`) throws `Missing where or truncate attribute in the options parameter of model.destroy.` (both used to update or delete every row); a `where` attribute whose value is `undefined` (a missing variable) throws `WHERE parameter "x" has invalid "undefined" value` in every query that takes a `where`, instead of silently matching nothing; an `ENUM` attribute without values throws `Values for ENUM have not been defined.` when the model is defined. Breaking only for code that relied on the old behaviour (an update or destroy without `where`, an undefined value in a `where`); `where: {}` is still allowed. Found by the v6 suite harness; differential tests.
- With `Sequelize.useCLS`, model hooks (`beforeCreate`, `afterFind`, `beforeBulkUpdate`, `beforeCount`, `beforeDestroy`, `beforeRestore`, `beforeUpsert`, ...) receive the current transaction in the `transaction` option they are given, as in Sequelize v6; the queries of the operation already used it. Found by the v6 suite harness; differential test.
- `sequelize.query` as in Sequelize v6: a statement given as an object (`{ query, values }`, `{ query, bind }`, or a class instance with these properties) works; conflicting `replacements` / `bind` (also `sql.values`, `sql.bind`) are rejected with the v6 messages ("Both `replacements` and `bind` cannot be set at the same time", ...); `replacements` that is neither an array nor a plain object, a missing named replacement (`Named replacement ":x" has no entry in the replacement map.`) and a missing bind parameter (`Named bind parameter "$x" has no value in the given object.`, also for `$0` and `$01` of an array) use the v6 error messages; integer and boolean replacements are sent with a cast (`$1::int4`, `$2::boolean`) so that `select :n as n` returns a number, as v6 does by writing the value into the SQL (the value stays a bound parameter). The generated SQL text of replacements changes accordingly. Found by the v6 suite harness; differential tests.
- Hook semantics of Sequelize v6: `individualHooks` of `update`, `destroy` and `restore` run the hook for every row at once (`Promise.all`; the first rejection ends the call) instead of one row after the other; a `beforeDestroy` hook that sets a VIRTUAL attribute no longer breaks the soft delete (virtual attributes are never written by `save`); `sequelize.options.hooks = {}` replaces the global hooks of the instance; `sequelize.modelManager` (`models`, `getModel`, `addModel`, `removeModel`). Differential tests.
- `InitOptions.name` (`{ singular, plural }`) is applied: it gives the default alias and foreign key of `belongsTo`, `hasOne`, `hasMany` and `belongsToMany` and the accessor names; it was ignored, so `Agent.belongsTo(User)` with `name: { singular: 'user' }` looked for the column `UserId` instead of `userId` ([#133](https://github.com/tormozz48/postgrelize/pull/133)).
- `findAndCountAll({ group })` forwards `group` to the count query, so `count` is the per-group array as in v6 instead of the total number of rows ([#133](https://github.com/tormozz48/postgrelize/pull/133)).

## [1.3.0] - 2026-11-22

Sequelize v6 parity part three: `findByPk` and `replacements`, the default export and constructable CommonJS entry, four runtime gaps found by Sequelize's own test suite, and a docs site rebuilt for finding any feature fast.

### Added

- Static hooks of `Sequelize`, as in v6: `Sequelize.addHook`, `removeHook`, `hasHook`, `hasHooks`, `runHooks` and the shorthand for every hook type (`Sequelize.beforeInit(fn)`, `Sequelize.afterConnect(name, fn)`, ...). `beforeInit(config, options)` and `afterInit(sequelize)` run for every instance created afterwards (changes to `config` and `options` are used for the connection); other static hook types are stored. `Sequelize.options.hooks = {}` removes all static hooks.
- `beforeDefine(attributes, options)` and `afterDefine(model)` hooks of a `Sequelize` instance run when a model is defined (`define` or `Model.init`): they can change `options.modelName`, `options.name`, the attributes and the options. Found by the v6 suite harness; differential tests.
- `findByPk(id, { rejectOnEmpty })` overload that resolves to the model (Sequelize v6 `NonNullFindOptions`); `findOne` takes the same `NonNullFindOptions`.
- `FindOptions.replacements` works as in v6: `:name` and `?` placeholders inside `literal()` of `findAll`, `findOne`, `findByPk`, `count`, `findAndCountAll` (and the other model queries) are substituted, every value as a bound parameter, arrays expanding to a list. This reverses the 1.2.0 deviation that finders ignored the option. New row on the Security page, payload and property tests, and a differential test against Sequelize v6.
- Default export and constructable CommonJS entry, as in Sequelize v6: `import Sequelize from 'postgrelize'` works, and `require('postgrelize')` is the `Sequelize` class with every named export as a property (so `new (require('postgrelize'))(url)` and `require('postgrelize').Sequelize` both work). In CommonJS `HasOne`, `HasMany`, `BelongsTo` and `BelongsToMany` stay the decorators. ADR-034
- `nest: true` for `sequelize.query` (nests `a.b` column names; implies `SELECT`), `distinct` and `col` for `findAndCountAll` (forwarded to its count query), `WhereAttributeHashValue` export.
- Docs site reorganised for finding things fast: a [Reference](https://tormozz48.github.io/postgrelize/reference/) hub (by entity and by task), an [Extensions](https://tormozz48.github.io/postgrelize/extensions/) page listing everything that Sequelize v6 lacks, and a generated [option reference](https://tormozz48.github.io/postgrelize/reference/options/) with a table (type, default, effect) for every option of every method. New guide pages for errors and for connection, pool and logging. Extensions are tagged `@postgrelize` in TSDoc (registered in `tsdoc.json`), and a `postgrelize extension` badge built from the tag marks them in the option reference, the API reference and the guide; `tests/docs` fail when an option has no description, an option's v6 status is undecided, a guide link has a dead anchor, or an extension section has no badge. Spec: `.10x/specs/2026-11-22-docs-reference-design.md`, ADR-035. Existing URLs are unchanged.

### Changed

- `Model#reload(options)` takes the `FindOptions` of v6 (`include`, `attributes`, `paranoid`, `lock`, `hooks`, ...) and reads the row through `findOne`, so default scopes and `paranoid` apply as in v6 (reloading a soft-deleted row needs `paranoid: false`). Breaking only for code that reloaded a soft-deleted row without options.
- Types now match v6: attribute `get` / `set` take `this` as the model, `WhereAttributeHash<T = any>`, `Model.sequelize` and `instance.sequelize` are `Sequelize`, `ModelValidatorFunction` accepts the callback style, hook function parameters are `any`.

### Fixed

- `Model.update` with `individualHooks: true`, as in Sequelize v6: it returns `[affectedCount, instances]` even without `returning`, and the changes `beforeUpdate` hooks make to the instances are written (as one UPDATE when every row got the same changes, else row by row with `hooks: false`). It used to ignore them. Found by the v6 suite harness; differential tests.
- `afterFind` hooks of `findOne` and `findByPk` receive the instance (or `null`), not an array, so a hook that changes the instance changes what `findOne` returns, as in v6. Code that read an array in an `afterFind` hook of `findOne` must read the instance. `findAll` is unchanged.
- `{ type: DataTypes.ENUM, values: ['a', 'b'] }` (the bare `ENUM` type with a `values` attribute option, as in Sequelize v6) defines the enum column; the type used to be undefined and `sync()` failed with `type "undefined" does not exist`. New attribute option `values`. Found by the v6 suite harness; differential test.
- An include given only a model (`include: [{ model: Tag }]`) resolves, when the source has several associations to that model, to the one without an explicit alias, as in Sequelize v6; it used to throw `EagerLoadingError: ... associated multiple times`. It still throws when every association to the model has an alias. Found by the v6 suite harness; differential test.
- Four gaps found by running Sequelize v6's own test suite against postgrelize, each with a differential test: `ValidationError#get(path)` returns the items of one attribute; `sequelize.define(name)` works without attributes; `BelongsTo#get(instances)` loads several sources at once and returns an object keyed by foreign key; `references: { model: SomeModel }` accepts a model class (DDL and `sync` ordering use its table name). Stage G3 of the v6 compatibility gate, spec `2026-11-22-v6-compat-gate-design`.

## [1.2.0] - 2026-11-22

Sequelize v6 parity for a production migration, part two: the `retry` option, the public `connectionManager` and the Sequelize v6 type API.

### Added

- The `retry` option of Sequelize v6 (`max`, `match`, `backoffBase`, `backoffExponent`, `backoffJitter`, `timeout`, `name`, `report`) on the `Sequelize` constructor, on queries and on transactions (merged field by field over the instance option). It repeats a failed query, including the connection acquisition, and the connection acquisition plus `BEGIN` of a transaction, with the matching and backoff rules of `retry-as-promised` (implemented in-house, no new dependency). A statement inside an open transaction, `COMMIT`, COPY and `listen` are not retried; nothing is retried by default or without `max`. The connection error classes carry the v6 names (`SequelizeConnectionRefusedError`, ...), so v6 `match` lists work unchanged. ADR-031
- `sequelize.connectionManager` with `getConnection(options?)` and `releaseConnection(connection)`, as in Sequelize v6. Every query, finder, write, transaction, `findEach`, `copyFrom` / `copyTo`, advisory lock and `sync` acquires and releases its pooled connection through these two methods, looked up at call time, so apps can reassign them on the instance to route connections (for example per request to one of several databases). A connection from another `Sequelize` instance's manager works on this instance and is released to its own pool; releasing a connection twice is ignored. New types `Connection`, `GetConnectionOptions`, `ConnectionManagerContract`. ADR-030
- `sequelize.connectionManager.destroyConnection(connection)` (closes a broken connection and removes it from its pool; the pool opens a replacement on demand) and `sequelize.connectionManager.pool` with live `size`, `available`, `using`, `waiting` and `maxSize` counters for health gauges, as in Sequelize v6 (readable before the first connection). With `replication` the counters are totals over the writer and the replicas, plus `pool.read` and `pool.write` (v6 has no totals there); `getConnection({ type: 'read' })` returns a replica connection and `releaseConnection` returns it to its replica pool (v6 reaches a replica only for the type `'SELECT'`, which is accepted too). New types `ConnectionPool`, `PoolCounters`. ADR-033
- Type API of Sequelize v6: `Model<TAttributes extends {} = any, TCreationAttributes = TAttributes>`, `ModelStatic` as in v6, `InitOptions.name`, `FindOptions.replacements`, the `Sequelize#query` overloads (`query<T>(sql, { type: QueryTypes.SELECT })` returns `T[]`, `plain: true` returns `T | null`, `model` returns instances, `QueryTypes.SELECT` works as a type), generic `Association<S, T>` and generic `BelongsTo` / `HasMany` / `HasOne` / `BelongsToMany` types, every `*Mixin` and `*MixinOptions` type of the four association files, and the exports `Includeable`, `ProjectionAlias`, `FindAndCountOptions`, `Options`, `Utils` (expression classes, `useInflection`, `pluralize`, `singularize`), `ModelCtor`, `ModelDefined`, `ModelType`, `NonNullFindOptions`, `FindOrBuildOptions`, `InstanceUpdateOptions`, `Identifier`, `GroupOption`, `BindOrReplacements`, `ColumnsDescription`. Not typed on purpose: `FindOptions.replacements` (finders do not substitute placeholders, only `sequelize.query` does) and the v6 `{ query, values }` form of `sequelize.query` (not accepted at runtime); `InitOptions.name` is typed but not yet applied to association names. A compat test compiles a corpus of v6-style code against the v6 declarations and against postgrelize and lists every v6 type name and option key that is still missing. ADR-032

### Changed

- `Model` attributes default to `any` (was `Record<string, unknown>`) and `ModelStatic<M>` has the v6 shape, so interface-typed models without index signatures compile. `Model.associations`, `belongsTo`, `hasOne`, `hasMany` and `belongsToMany` return the association class types instead of a structural description; `Sequelize.Utils` is now provided. ADR-032

## [1.1.0] - 2026-11-22

Sequelize v6 parity for a production migration (S19): `minifyAliases`, `afterConnect`, `useCLS(namespace)` with cls-hooked namespaces, the static aliases, hook shorthands and the missing `Model` / `QueryInterface` methods, backed by a test that compares the public API with `sequelize@6`.

### Added

- `Sequelize#truncate` (empties all model tables, referencing tables first, as in v6), `Deferrable.SET_DEFERRED` / `Deferrable.SET_IMMEDIATE` for the `deferrable` transaction option and `queryInterface.deferConstraints` (S19). With these, every v6 name that postgrelize lacks is on the API-surface allow-list with a reason. [#107](https://github.com/tormozz48/postgrelize/pull/107)
- Sequelize v6 `QueryInterface` methods: `showIndex`, `showConstraint` (and `QueryTypes.SHOWCONSTRAINTS`), `getForeignKeysForTables`, `assertTableHasColumn`, `databaseVersion`, `createDatabase`, `dropDatabase`, `quoteIdentifier`, `quoteIdentifiers` (S19). The catalog lookups filter by schema and `showConstraint` honours the constraint name (v6 ignores it). [#106](https://github.com/tormozz48/postgrelize/pull/106)
- Sequelize v6 `Model` members: `describe`, `dropSchema`, `queryInterface`, `findCreateFind`, `getAssociations`, `getAssociationForAlias`, `hasAlias`, `removeAttribute`, `refreshAttributes`, and on instances `equalsOneOf`, `setAttributes`, `where` and `toString` (S19). `findCreateFind` inside a transaction uses a savepoint and returns the row that won a race with `created: false` (v6 returns an unsaved instance). [#105](https://github.com/tormozz48/postgrelize/pull/105)
- Hook shorthands as in Sequelize v6: `sequelize.beforeCreate(fn)` and the other hooks that run (also `beforeConnect`, `afterConnect`, `beforeBulkSync`, `afterBulkSync`), `sequelize.runHooks()`, `Model.beforeSync()` and `Model.afterSync()` (S19). [#104](https://github.com/tormozz48/postgrelize/pull/104)
- Sequelize v6 static aliases: the data types (`Sequelize.STRING`, ...), the error classes (also `QueryError`, `SequelizeScopeError`, `UnknownConstraintError`, `ValidationErrorItemOrigin` / `ValidationErrorItemType` and `Error`), `Deferrable`, `and`, `or`, `useInflection`, `version`, `Association` and the association classes, `QueryInterface`, `Validator`; the same data types and errors as module exports; `DataTypes.NUMERIC` and `DataTypes['DOUBLE PRECISION']`; instance members `queryInterface`, `QueryTypes`, `random()`, `escape()`, `validate()`, `getDatabaseName()`, `refreshTypes()`, `log()`, `and`, `or` (S19). [#103](https://github.com/tormozz48/postgrelize/pull/103)
- A test compares the public API surface of `Sequelize`, `Model`, `QueryInterface`, `Transaction`, `DataTypes` and the exports with `sequelize@6`; every v6 name postgrelize lacks is on an allow-list (`tests/compat/api-surface-exceptions.json`) that is rendered as "API differences" in the migration guide and only shrinks (S19). [#102](https://github.com/tormozz48/postgrelize/pull/102)
- `minifyAliases` constructor option (Sequelize v6 parity): shortens include column aliases and table aliases of 64 or more characters so deep includes with long association names stay within PostgreSQL's 63-byte identifier limit, and maps rows back. [#101](https://github.com/tormozz48/postgrelize/pull/101)

### Fixed

- The `afterConnect` hook now runs for every new pooled connection after `beforeConnect`, with `(connection, config)` as in Sequelize v6; the hook may run queries on the connection, and an error it throws closes that connection and rejects the query that needed it (v6 parity). [#99](https://github.com/tormozz48/postgrelize/pull/99)
- `Sequelize.useCLS(namespace)` no longer ignores a `cls-hooked` style namespace: managed transactions store themselves under `namespace.get('transaction')` (cleared when they finish), queries without a `transaction` option read it from there, and a non-namespace argument throws `Must provide CLS namespace`, as in Sequelize v6 (v6 parity). `useCLS()` without an argument is unchanged. [#100](https://github.com/tormozz48/postgrelize/pull/100)

## [1.0.0] - 2026-11-21

First release on npmjs.com, as `postgrelize` (`npm i postgrelize`). The scoped `@tormozz48/postgrelize` mirror on GitHub Packages continues at the same version and is deprecated (ADR-028). The public API exported from `src/index.ts` is now covered by Semantic Versioning.

### Breaking

- The package is renamed from `@tormozz48/postgrelize` to `postgrelize` for publishing on npmjs.com; install it with `npm i postgrelize` and update imports (S18a, ADR-028). [#90](https://github.com/tormozz48/postgrelize/pull/90)

### Added

- Release workflow publishes to npmjs.com with provenance and keeps a deprecated GitHub Packages mirror (S18a, ADR-028). [#90](https://github.com/tormozz48/postgrelize/pull/90)
- Hero art and a favicon set for the documentation site. [#88](https://github.com/tormozz48/postgrelize/pull/88)
- npm version and downloads badges, and a migration note for users of the scoped name (S18b). [#92](https://github.com/tormozz48/postgrelize/pull/92)
- Backlog 5 roadmap spec for publishing on npmjs.com (planning only, no code). [#89](https://github.com/tormozz48/postgrelize/pull/89)

### Changed

- CI runs the checks on Node 20, 22 and 24; one integration and compat job runs on Node 24 with PostgreSQL 18. [#93](https://github.com/tormozz48/postgrelize/pull/93)

## [0.12.0] - 2026-11-16

### Added

- Expression indexes: `{ expression }` index fields, with `nulls` ordering (S13, ADR-027). [#78](https://github.com/tormozz48/postgrelize/pull/78)
- `EXCLUDE` constraints, `NOT VALID` constraints and `validateConstraint` (S13, ADR-027). [#81](https://github.com/tormozz48/postgrelize/pull/81)
- PostgreSQL 18 constraint forms: `NOT ENFORCED`, `WITHOUT OVERLAPS`, `PERIOD` (S13, ADR-027). [#82](https://github.com/tormozz48/postgrelize/pull/82)
- Declarative table partitioning (S13, ADR-027). [#84](https://github.com/tormozz48/postgrelize/pull/84)
- Geometric data types `POINT`, `LINE`, `LSEG`, `BOX`, `PATH`, `POLYGON`, `CIRCLE` (S15, ADR-026). [#77](https://github.com/tormozz48/postgrelize/pull/77)
- `MULTIRANGE` data type (S15, ADR-026). [#79](https://github.com/tormozz48/postgrelize/pull/79)
- `COMPOSITE` data type (S15, ADR-026). [#80](https://github.com/tormozz48/postgrelize/pull/80)
- PostGIS `GEOGRAPHY` and `GEOMETRY` GeoJSON values with a hex EWKB reader and writer, tested in an optional CI job (S15, ADR-026). [#83](https://github.com/tormozz48/postgrelize/pull/83)

### Changed

- Every PostgreSQL feature beyond Sequelize v6 now needs a runnable example, a guide section and a CI check (S16b). [#85](https://github.com/tormozz48/postgrelize/pull/85)
- Added examples and guide entries for `NULLS FIRST/LAST`, `OVERRIDING` and long `IN` lists. [#86](https://github.com/tormozz48/postgrelize/pull/86)
- Release 0.12.0 version bump. [#87](https://github.com/tormozz48/postgrelize/pull/87)

## [0.11.0] - 2026-11-16

### Added

- QueryInterface support for extensions and sequences (S11, ADR-025). [#70](https://github.com/tormozz48/postgrelize/pull/70)
- QueryInterface support for functions and triggers (S11, ADR-025). [#72](https://github.com/tormozz48/postgrelize/pull/72)
- QueryInterface support for views and materialized views (S11, ADR-025). [#73](https://github.com/tormozz48/postgrelize/pull/73)
- Row-level security policies on QueryInterface (S11, ADR-025). [#74](https://github.com/tormozz48/postgrelize/pull/74)
- `UNLOGGED` and `TEMPORARY` tables (S11, ADR-025). [#75](https://github.com/tormozz48/postgrelize/pull/75)
- Operator and search helpers: `Op.similarTo`, `Op.notSimilarTo`, `jsonPathExists`, range and network operators, full-text helpers (`toTsVector`, `tsRank`, `tsHeadline`, `setWeight`) and `pg_trgm` helpers (S17). [#71](https://github.com/tormozz48/postgrelize/pull/71)

### Changed

- Release flow documented: the release commit goes through a pull request. [#69](https://github.com/tormozz48/postgrelize/pull/69)
- Release 0.11.0 version bump. [#76](https://github.com/tormozz48/postgrelize/pull/76)

## [0.10.0] - 2026-11-16

### Added

- Opt-in named prepared statements through the `statementCache` option (S16, ADR-023). [#61](https://github.com/tormozz48/postgrelize/pull/61)
- `DEFERRABLE` transaction mode, per-query `statementTimeout` and `bulkCreate({ unnest: true })` (S16). [#64](https://github.com/tormozz48/postgrelize/pull/64)
- Set operations (`union`, `intersect`, `except`) on subqueries and `FETCH FIRST … WITH TIES` (S12, ADR-024). [#63](https://github.com/tormozz48/postgrelize/pull/63)
- `FROM` sources: `VALUES`, set-returning functions with ordinality, `JSON_TABLE` (PostgreSQL 17), `LATERAL` and `TABLESAMPLE` (S12, ADR-024). [#65](https://github.com/tormozz48/postgrelize/pull/65)
- Data-modifying CTEs and CTE `SEARCH` / `CYCLE` clauses (S12, ADR-024). [#66](https://github.com/tormozz48/postgrelize/pull/66)
- New data types: HSTORE objects, `LTREE`, `TIMESTAMP`, `MONEY`, `MACADDR8`, `XML`, `BIT` / `VARBIT`, `TSQUERY` (S14). [#62](https://github.com/tormozz48/postgrelize/pull/62)
- Project logo. [#60](https://github.com/tormozz48/postgrelize/pull/60)

### Changed

- Raw reads resolve the column plan once per result, so they run faster (S10b). [#67](https://github.com/tormozz48/postgrelize/pull/67)
- Release 0.10.0 version bump. [#68](https://github.com/tormozz48/postgrelize/pull/68)

### Fixed

- HSTORE values are returned as objects. [#62](https://github.com/tormozz48/postgrelize/pull/62)

## [0.9.0] - 2026-11-15

### Added

- Public model decorators (`@Table`, `@Column`, association and hook decorators) and `sequelize.addModels` (S6g, ADR-022). [#42](https://github.com/tormozz48/postgrelize/pull/42)
- PostgreSQL coverage matrix page listing what is supported, literal-only, planned or out of scope (S9). [#41](https://github.com/tormozz48/postgrelize/pull/41)
- LLM-facing documentation: `llms.txt`, `llms-full.txt`, `llm/USAGE.md` and an Agent Skill shipped in the npm package (S8a). [#46](https://github.com/tormozz48/postgrelize/pull/46)
- TSDoc for the whole public API, enforced by tests and the docs build (S8b). [#49](https://github.com/tormozz48/postgrelize/pull/49)
- Security page, SQL-injection test suite (payload and property tests), CodeQL scanning and `SECURITY.md` (S5, ADR-020). [#34](https://github.com/tormozz48/postgrelize/pull/34)
- Performance guide, plus a benchmark that compares every case with Sequelize v6 (S10). [#51](https://github.com/tormozz48/postgrelize/pull/51), [#57](https://github.com/tormozz48/postgrelize/pull/57)
- `Sequelize#createSchema`, `showAllSchemas`, `dropSchema` and `QueryInterface#dropAllSchemas`, which v6 exposes. [#34](https://github.com/tormozz48/postgrelize/pull/34)

### Changed

- Internals are split into small classes, mixins and decorators under enforced size limits (S6a to S6f, ADR-021). [#35](https://github.com/tormozz48/postgrelize/pull/35), [#36](https://github.com/tormozz48/postgrelize/pull/36), [#37](https://github.com/tormozz48/postgrelize/pull/37), [#38](https://github.com/tormozz48/postgrelize/pull/38), [#39](https://github.com/tormozz48/postgrelize/pull/39), [#40](https://github.com/tormozz48/postgrelize/pull/40), [#43](https://github.com/tormozz48/postgrelize/pull/43)
- Performance work on row mapping, include assembly, option merging, hook dispatch, SQL assembly, `toJSON`, change tracking and validation (S10). [#52](https://github.com/tormozz48/postgrelize/pull/52), [#53](https://github.com/tormozz48/postgrelize/pull/53), [#55](https://github.com/tormozz48/postgrelize/pull/55), [#56](https://github.com/tormozz48/postgrelize/pull/56)
- Test coverage raised to 99.7% lines, with thresholds enforced in CI (S7). [#44](https://github.com/tormozz48/postgrelize/pull/44)
- Parity and robustness fixes against Sequelize v6 behaviour (S7b). [#47](https://github.com/tormozz48/postgrelize/pull/47), [#48](https://github.com/tormozz48/postgrelize/pull/48), [#50](https://github.com/tormozz48/postgrelize/pull/50)

### Fixed

- `create`, `bulkCreate` and `save` with an explicit `fields` list add timestamps, version and defaulted keys like v6. [#47](https://github.com/tormozz48/postgrelize/pull/47)
- `Model.schema(name, options)` returns a schema-bound model, `set()` keeps an attribute changed after setting it back, `aggregate` honours `plain: false` and `dataType`, and `hasHook` of an unregistered type returns `undefined`. [#47](https://github.com/tormozz48/postgrelize/pull/47)
- LISTEN reconnects after a failed connect, `beforeBulkSync` / `afterBulkSync` and per-model sync hooks run, and checked-out clients handle errors and are discarded when broken. [#48](https://github.com/tormozz48/postgrelize/pull/48)
- Association, validation and raw-query results match v6 (for example `hasOne` setters, `EagerLoadingError` on a wrong alias, `belongsToMany` `joinTableAttributes`). [#50](https://github.com/tormozz48/postgrelize/pull/50)

### Security

- Closed the injection paths found by the S5 audit: unknown lock strengths fall back to `FOR UPDATE`, `Model.aggregate` validates the function name, `where(attr, comparator, value)` rejects comment tokens, `transaction({ isolationLevel })` and `deferrable` accept only known constants, DDL type options must be non-negative integers, and the `timezone` option must be an offset or IANA name (S5, ADR-020). [#34](https://github.com/tormozz48/postgrelize/pull/34)

## [0.8.1] - 2026-11-15

### Added

- `AGENTS.md` contributor guide and documentation sync rules (ADR-019). [#32](https://github.com/tormozz48/postgrelize/pull/32)

### Fixed

- Test databases are isolated per run and lock-ordering races in tests are removed. No library code changed. [#31](https://github.com/tormozz48/postgrelize/pull/31)

## [0.8.0] - 2026-11-15

### Breaking

- The `postgrelize/effect` entry point and the Effect-based API are removed. Use the main `postgrelize` entry point. [#29](https://github.com/tormozz48/postgrelize/pull/29)

### Changed

- The whole library is rewritten as small classes with injected collaborators instead of an Effect core (OOP rewrite, ADR-018, supersedes ADR-005 and ADR-017). [#29](https://github.com/tormozz48/postgrelize/pull/29)

### Removed

- The `effect` dependency and the `postgrelize/effect` export. [#29](https://github.com/tormozz48/postgrelize/pull/29)

### Fixed

- `describeTable` reads enum values from the column type's own schema, in declared order. [#29](https://github.com/tormozz48/postgrelize/pull/29)
- Expression classes are recognised across package copies, so `instanceof` checks keep working. [#29](https://github.com/tormozz48/postgrelize/pull/29)

## [0.7.0] - 2026-11-15

### Added

- VitePress documentation site with runnable examples and a generated API reference (S3). [#24](https://github.com/tormozz48/postgrelize/pull/24)
- Effect-based connection and transaction layer and the `postgrelize/effect` entry point (S4 steps 1 to 3, ADR-017). [#26](https://github.com/tormozz48/postgrelize/pull/26)
- Hooks and the read pipeline (`findAll`, `count`) as Effect programs (S4 step 4). [#28](https://github.com/tormozz48/postgrelize/pull/28)

### Fixed

- A transaction-start failure no longer leaks a pooled connection. [#26](https://github.com/tormozz48/postgrelize/pull/26)
- `include: [{ separate: true, limit }]` applies `limit` per parent, like v6. [#25](https://github.com/tormozz48/postgrelize/pull/25)
- `findEach` loads `separate: true` includes for each batch. [#25](https://github.com/tormozz48/postgrelize/pull/25)

## [0.6.0] - 2026-11-14

### Added

- README badges and a self-hosted coverage report (S1). [#20](https://github.com/tormozz48/postgrelize/pull/20)
- `docs/sequelize-issues.md`: a public page of the Sequelize v6 PostgreSQL issues postgrelize fixes (S2, ADR-016). [#22](https://github.com/tormozz48/postgrelize/pull/22), [#23](https://github.com/tormozz48/postgrelize/pull/23)

### Fixed

- Included associations and junction rows are instance properties (`todo.User`, `user.Posts`). [#22](https://github.com/tormozz48/postgrelize/pull/22)
- `upsert` and `bulkCreate({ updateOnDuplicate })` pick the conflict target from unique `indexes` like v6 (sequelize#13734). [#22](https://github.com/tormozz48/postgrelize/pull/22)
- Explicit `createdAt` / `updatedAt` attributes keep their definition (sequelize#10419), and `upsert` keeps a supplied `updatedAt` (sequelize#17486). [#22](https://github.com/tormozz48/postgrelize/pull/22)
- `ARRAY(ENUM)` returns arrays (sequelize#15466, sequelize#11100). [#22](https://github.com/tormozz48/postgrelize/pull/22)
- `sync()` handles foreign-key cycles by adding back-references after all tables exist (sequelize#15522). [#22](https://github.com/tormozz48/postgrelize/pull/22)
- `addColumn` and `sync({ alter })` keep column `comment` (sequelize#17118). [#22](https://github.com/tormozz48/postgrelize/pull/22)
- `order: ['jsonCol.path']` works and orders by the jsonb value (sequelize#9040). [#22](https://github.com/tormozz48/postgrelize/pull/22)
- JSON `where` keys with `,`, `"` or `\` match correctly (sequelize#18617), jsonb operators work on nested paths (sequelize#5173), and `{ [Op.any]: [...] }` works (sequelize#16043). [#23](https://github.com/tormozz48/postgrelize/pull/23)
- `upsert({ overriding })` works on `GENERATED ALWAYS` identity columns (sequelize#14497) and uses a partial unique index predicate (sequelize#12595). [#23](https://github.com/tormozz48/postgrelize/pull/23)
- `bulkCreate({ ignoreDuplicates })` assigns returned rows to the inserted records. [#23](https://github.com/tormozz48/postgrelize/pull/23)
- `describeTable` unquotes literal defaults (sequelize#16787), and `sync({ alter })` keeps the sequence of non-key `autoIncrement` columns (sequelize#13167). [#23](https://github.com/tormozz48/postgrelize/pull/23)
- `sync({ schema })` and `drop({ schema })` act only on that schema (sequelize#18423). [#23](https://github.com/tormozz48/postgrelize/pull/23)
- `belongsToMany` with a custom `sourceKey` and `limit` (sequelize#18256), and a top-level `$include.attr$` condition with a `hasMany` include and `limit` (sequelize#12971). [#23](https://github.com/tormozz48/postgrelize/pull/23)

## [0.5.0] - 2026-11-14

### Added

- `returningOld` / `oldValues`: `RETURNING old.*` on PostgreSQL 18 (ADR-015). [#17](https://github.com/tormozz48/postgrelize/pull/17)
- Scopes of included models apply, like v6 (ADR-015). [#17](https://github.com/tormozz48/postgrelize/pull/17)

## [0.4.0] - 2026-11-14

### Added

- Read replica routing with the `replication` option and `useMaster` (ADR-014). [#15](https://github.com/tormozz48/postgrelize/pull/15)
- Nested creation through `include`, for example `Post.create({ Comments: [...] }, { include })`. [#15](https://github.com/tormozz48/postgrelize/pull/15)

## [0.3.0] - 2026-11-14

### Added

- CTE options: `WITH` and `WITH RECURSIVE` (ADR-013). [#13](https://github.com/tormozz48/postgrelize/pull/13)
- `Model.copyTo` for `COPY … TO` (ADR-013). [#13](https://github.com/tormozz48/postgrelize/pull/13)

## [0.2.0] - 2026-11-14

### Added

- Query power (P1-A): subqueries, `EXISTS`, `DISTINCT ON`, window functions and row comparison. [#8](https://github.com/tormozz48/postgrelize/pull/8)
- Write power (P1-B): `UPDATE … FROM`, `DELETE … USING`, `INSERT … SELECT` and `MERGE`. [#9](https://github.com/tormozz48/postgrelize/pull/9)
- Connection power (P1-C): cursors, `LISTEN` / `NOTIFY`, `SET LOCAL`, advisory locks and `COPY`. [#10](https://github.com/tormozz48/postgrelize/pull/10)
- Schema power (P1-D): identity and generated columns, `INTERVAL`, `OVERRIDING` and enum alteration. [#11](https://github.com/tormozz48/postgrelize/pull/11)

## [0.1.0] - 2026-11-14

First release: a PostgreSQL-only, Sequelize v6 drop-in ORM written in TypeScript, published to GitHub Packages.

### Added

- Project tooling, CI/CD on GitHub Actions and the first documentation (M0, ADR-001, ADR-006, ADR-007). [#1](https://github.com/tormozz48/postgrelize/pull/1)
- Core: `Sequelize`, model CRUD, `where` and `Op`, data types, errors and transactions, on the `pg` driver with bound parameters (M1, ADR-002, ADR-004). [#2](https://github.com/tormozz48/postgrelize/pull/2)
- `INSERT … ON CONFLICT` through the `onConflict` option and `Model.insert()`, plus security hardening (M2, ADR-003). [#3](https://github.com/tormozz48/postgrelize/pull/3)
- Hooks, validation (validator.js and Standard Schema), scopes, paranoid models and optimistic locking (M3, ADR-008). [#4](https://github.com/tormozz48/postgrelize/pull/4)
- Associations and eager loading with `include` (M4, ADR-009). [#5](https://github.com/tormozz48/postgrelize/pull/5)
- `QueryInterface`, `sync` / `drop` and constraints (M5, ADR-010). [#6](https://github.com/tormozz48/postgrelize/pull/6)

[Unreleased]: https://github.com/tormozz48/postgrelize/compare/v1.9.8...HEAD
[1.9.8]: https://github.com/tormozz48/postgrelize/compare/v1.9.7...v1.9.8
[1.9.7]: https://github.com/tormozz48/postgrelize/compare/v1.9.6...v1.9.7
[1.9.6]: https://github.com/tormozz48/postgrelize/compare/v1.9.5...v1.9.6
[1.9.5]: https://github.com/tormozz48/postgrelize/compare/v1.9.4...v1.9.5
[1.9.4]: https://github.com/tormozz48/postgrelize/compare/v1.9.3...v1.9.4
[1.9.3]: https://github.com/tormozz48/postgrelize/compare/v1.9.2...v1.9.3
[1.9.2]: https://github.com/tormozz48/postgrelize/compare/v1.9.1...v1.9.2
[1.9.1]: https://github.com/tormozz48/postgrelize/compare/v1.9.0...v1.9.1
[1.9.0]: https://github.com/tormozz48/postgrelize/compare/v1.8.5...v1.9.0
[1.8.5]: https://github.com/tormozz48/postgrelize/compare/v1.8.4...v1.8.5
[1.8.4]: https://github.com/tormozz48/postgrelize/compare/v1.8.3...v1.8.4
[1.8.3]: https://github.com/tormozz48/postgrelize/compare/v1.8.2...v1.8.3
[1.8.2]: https://github.com/tormozz48/postgrelize/compare/v1.8.1...v1.8.2
[1.8.1]: https://github.com/tormozz48/postgrelize/compare/v1.8.0...v1.8.1
[1.8.0]: https://github.com/tormozz48/postgrelize/compare/v1.7.0...v1.8.0
[1.7.0]: https://github.com/tormozz48/postgrelize/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/tormozz48/postgrelize/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/tormozz48/postgrelize/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/tormozz48/postgrelize/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/tormozz48/postgrelize/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/tormozz48/postgrelize/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/tormozz48/postgrelize/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/tormozz48/postgrelize/compare/v0.12.0...v1.0.0
[0.12.0]: https://github.com/tormozz48/postgrelize/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/tormozz48/postgrelize/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/tormozz48/postgrelize/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/tormozz48/postgrelize/compare/v0.8.1...v0.9.0
[0.8.1]: https://github.com/tormozz48/postgrelize/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/tormozz48/postgrelize/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/tormozz48/postgrelize/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/tormozz48/postgrelize/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/tormozz48/postgrelize/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/tormozz48/postgrelize/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/tormozz48/postgrelize/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/tormozz48/postgrelize/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/tormozz48/postgrelize/releases/tag/v0.1.0
