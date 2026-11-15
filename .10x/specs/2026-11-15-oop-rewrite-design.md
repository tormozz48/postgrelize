# Rewrite to object-oriented style, remove Effect

**Date:** 2026-11-15 · **ADR:** 018 (supersedes ADR-005 functional core, ADR-017 Effect) · **Owner decisions:**
everything as classes; remove `postgrelize/effect` and release 0.8.0; one PR.

## Goals
- No `effect` dependency; `postgrelize/effect` entry point, docs page and example removed (breaking change, 0.8.0).
- Behaviour lives in classes with single responsibilities and constructor-injected collaborators (SOLID).
  No exported free functions in `src/` except the public v6 helpers that Sequelize itself exposes as functions
  (`fn`, `col`, `literal`, `where`, `cast`, `json`, `and`, `or`, `excluded`, ...), which become thin factories
  returning class instances.
- Public Sequelize v6 API, error classes, option shapes and SQL output unchanged: unit, integration,
  differential and docs suites pass without changing assertions (test helpers may be adapted).
- Performance: `bench/compare.ts` gate (row-heavy cases ≤ +10% vs `bench/baseline.json`).

## What stays a type, not a class
Plain data with no behaviour: SQL AST node shapes (`src/sql/ast.ts`), option bags (`FindOptions`, ...),
`Op` (an object of symbols, as in v6), constant tables (`HOOK_TYPES`, `ISOLATION_LEVELS`, ...).

## Target classes (by area)
| Area | Classes |
|---|---|
| connection | `ConnectionConfig` (parse constructor args, pool configs, replication), `ConnectionManager` (pools, execute, acquire, copy, dedicated, close), `ReplicaRouter`, `QueryLogger`, `CopyEncoder`, `CopyFromStdin`, `CopyToStdout`, `NotificationListener` |
| errors | v6 error classes (unchanged), `PgErrorMapper` |
| transaction | `Transaction` (async/await), `TransactionContext` (AsyncLocalStorage / CLS), `TransactionRunner` (managed transactions) |
| hooks | `HookRegistry` (add / remove / has / run) |
| sql | `SqlCompiler` (AST → text + params), `OrderDirection` |
| where | `WhereCompiler` (with an injected attribute resolver) |
| expressions | `Literal`, `Fn`, `Col`, `Cast`, `Json`, `Where`, `Subquery`, `Exists`, `Tuple`, `Over`, `Excluded` (v6 has `Utils.Literal`, `Utils.Fn`, ... too) |
| data-types | data type classes per kind (`StringType`, `IntegerType`, `ArrayType`, `EnumType`, ...) with `DataTypes` callable factories kept for v6 usage (`DataTypes.STRING`, `DataTypes.STRING(20)`); `ArrayLiteralParser` |
| validation | `InstanceValidator`, `StandardSchemaValidator` |
| ddl | `DdlGenerator`, `SqlLiteral` (escaping) |
| query-interface | `QueryInterface` (unchanged API), `SchemaSynchronizer` (sync / drop / dependency order / deferred FKs) |
| model | `ModelDefinition`, `ModelRegistry` (per-class state), `ScopeRegistry`, `SelectQueryBuilder`, `InsertQueryBuilder`, `UpdateQueryBuilder`, `DeleteQueryBuilder`, `MergeQueryBuilder`, `OnConflictBuilder`, `CteBuilder`, `RowMapper`, `InstanceLifecycle`, operation classes behind `Model` statics (`FindOperation`, `CountOperation`, `CreateOperation`, `BulkCreateOperation`, `UpdateOperation`, `DestroyOperation`, `UpsertOperation`, `CopyOperation`, ...) |
| associations | `Association` base with `BelongsTo`, `HasOne`, `HasMany`, `BelongsToMany` (as in v6), `IncludeResolver`, `IncludeQueryBuilder`, `IncludeLoader`, `NestedCreator` |
| query | `RawQuery` (replacements / bind) |

`Model` and `Sequelize` stay the public facades; their statics delegate to the operation classes.

## Delivery
One branch / one PR, one commit per area in this order: remove Effect → connection, errors, transactions,
hooks → SQL compiler, where, expressions → data types, validation, DDL, QueryInterface, sync → model internals,
associations, includes. Each commit: lint, format, types, build, all test suites, docs build green.
Benchmark gate before the PR.

## Risks
- Very large diff in one PR: mitigated by per-area commits and unchanged test assertions.
- Behaviour drift: the differential suite against sequelize@6 is the safety net.
- Performance: class dispatch is cheap, but allocation of builder objects on hot paths is watched by the gate.
