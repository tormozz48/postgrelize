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

### Added

- Cascade hooks, as in Sequelize v6: an association with `onDelete: 'CASCADE'` and `hooks: true` loads its rows and destroys each with its own `beforeDestroy` / `afterDestroy` hooks when the owner instance is destroyed (a real delete, not the soft delete of a paranoid model); an error in a hook stops the destroy. This replaces the documented limitation that `hooks` was accepted and ignored. `association.options` is public, as in v6. Found by the v6 suite harness; differential tests.
- `IncludeOptions.on` (custom `ON` condition of an include join, as in v6), `AssociationOptions.hooks` (accepted for v6 typing; the cascade runs in PostgreSQL), `QueryInterface#queryGenerator` (typed `unknown` like v6), the `LOCK` type next to the `LOCK` value, `GroupedCountResultItem`, `instance.update(key, value)`, and `fn` / `col` / `literal` values for `Model.update`, `Model.updateStatement` and `instance.update`. Part of the Sequelize v6 type-parity work ([#133](https://github.com/tormozz48/postgrelize/pull/133), ADR-032).
- `Model#get(key: string)` overload and `get<K extends keyof this>(key)` like v6, so included associations and model getters type-check.

### Changed

- `findAndCountAll` has the v6 overloads: `count` is a number, or an array of `GroupedCountResultItem` when `group` is given. `ConstraintErrorOptions.parent` is optional, and `LoggingFunction` is `(sql: string, timing?: number) => void` as in v6.

### Fixed

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

[Unreleased]: https://github.com/tormozz48/postgrelize/compare/v1.3.0...HEAD
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
