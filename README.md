<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/public/logo-wordmark-dark.svg">
    <img alt="postgrelize" src="docs/public/logo-wordmark.svg" height="64">
  </picture>
</p>

<p align="center">
  PostgreSQL-only ORM for Node.js with the <a href="https://sequelize.org/docs/v6/">Sequelize v6</a> API — plus the PostgreSQL features Sequelize can't express.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/postgrelize"><img alt="npm version" src="https://img.shields.io/npm/v/postgrelize?label=npm"></a>
  <a href="https://www.npmjs.com/package/postgrelize"><img alt="npm downloads" src="https://img.shields.io/npm/dw/postgrelize?label=downloads"></a>
  <a href="https://github.com/tormozz48/postgrelize/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/tormozz48/postgrelize/actions/workflows/ci.yml/badge.svg?branch=main"></a>
  <a href="https://tormozz48.github.io/postgrelize/coverage/"><img alt="coverage" src="https://img.shields.io/endpoint?url=https%3A%2F%2Ftormozz48.github.io%2Fpostgrelize%2Fcoverage%2Fbadge.json"></a>
  <img alt="PostgreSQL 16–18" src="https://img.shields.io/badge/PostgreSQL-16%20%7C%2017%20%7C%2018-336791?logo=postgresql&logoColor=white">
  <img alt="Node.js 20+" src="https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white">
  <a href="https://tormozz48.github.io/postgrelize/"><img alt="docs" src="https://img.shields.io/badge/docs-API%20reference-blue"></a>
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/github/license/tormozz48/postgrelize"></a>
</p>

## Why postgrelize

- **Drop-in for Sequelize v6.** `Sequelize`, `Model`, `DataTypes`, `Op`, hooks, validations, scopes, paranoid models, associations and `include`, transactions, `QueryInterface` and `sync` behave like v6. A differential test suite runs every scenario on both libraries and compares results. The TypeScript types follow the v6 declarations too (`Model`, `ModelStatic`, `query<T>`, association mixins), checked by a type-level parity test.
- **PostgreSQL first.** One dialect, so every feature can use PostgreSQL fully instead of the lowest common denominator.
- **Fast.** In the library-overhead benchmark (no database) most operations take 3–10× less CPU time than on Sequelize v6, and a `where` with an `Op.in` of 5 000 values 18× less. Reads of many rows or with `hasMany` / `belongsToMany` includes gain 1.3–1.9×, and `build` + `toJSON` is on par. The table, the method and tuning tips are on the [Performance](https://tormozz48.github.io/postgrelize/guide/performance) page.
- **Safe by default.** Values are always bound parameters; identifiers are quoted; order directions, cast types and operators are allow-listed.
- **Typed and documented.** Strict TypeScript, TSDoc on every export, [API reference](https://tormozz48.github.io/postgrelize/).

### What you get on top of Sequelize v6

Everything below is new in postgrelize; Sequelize v6 behaviour never changes. Each area links to its guide page and a runnable example. The full list, with PostgreSQL versions, is on the [extensions page](https://tormozz48.github.io/postgrelize/extensions/).

- **Upserts and RETURNING**: `onConflict` with any target, expression updates, `WHERE`, `DO NOTHING`; `Model.insert()` with `wasInserted`; `returningOld` (PostgreSQL 18). [Guide](https://tormozz48.github.io/postgrelize/guide/upserts) · [upserts](docs/examples/upserts.ts) · [returning-old](docs/examples/returning-old.ts)
- **Bulk writes and COPY**: `bulkCreate({ unnest: true })`, `MERGE`, `UPDATE ... FROM`, `DELETE ... USING`, `INSERT ... SELECT`, `COPY FROM` / `COPY TO` streaming. [Guide](https://tormozz48.github.io/postgrelize/guide/bulk-writes) · [bulk-writes](docs/examples/bulk-writes.ts) · [merge-returning](docs/examples/merge-returning.ts) · [copy](docs/examples/copy.ts)
- **Advanced queries**: CTEs and `WITH RECURSIVE`, set operations, `LATERAL`, subqueries, `DISTINCT ON`, window functions, ordered aggregates (`arrayAgg`, `stringAgg`, `jsonbAgg`, array slices), `ROLLUP` / `CUBE` / `GROUPING SETS`, keyset pagination, `TABLESAMPLE`, `JSON_TABLE`, operator and full-text search helpers, server-side cursors. [Guide](https://tormozz48.github.io/postgrelize/guide/advanced-queries) · [advanced-queries](docs/examples/advanced-queries.ts) · [aggregates](docs/examples/aggregates.ts) · [operator-helpers](docs/examples/operator-helpers.ts) · [json-table](docs/examples/json-table.ts)
- **Sessions and scaling**: `LISTEN/NOTIFY`, `SET LOCAL` for RLS, advisory locks, `DEFERRABLE` transactions, `statementTimeout`, read replicas, named prepared statements. [Guide](https://tormozz48.github.io/postgrelize/guide/sessions) · [sessions](docs/examples/sessions.ts) · [connection](docs/examples/connection.ts)
- **Decorators**: `@Table`, `@Column`, associations and hook decorators with `sequelize.addModels`, in TC39 and legacy modes. [Guide](https://tormozz48.github.io/postgrelize/guide/decorators) · [decorators](docs/examples/decorators.ts)
- **Schema objects, constraints and indexes**: sequences, views, materialized views, RLS policies, functions, triggers, partitioning, expression indexes, `EXCLUDE`, temporal constraints. [Schema objects](https://tormozz48.github.io/postgrelize/guide/schema-objects) · [Constraints and indexes](https://tormozz48.github.io/postgrelize/guide/constraints-indexes) · [schema-objects](docs/examples/schema-objects.ts) · [constraints-indexes](docs/examples/constraints-indexes.ts)
- **Data types**: identity and generated columns, `INTERVAL`, `HSTORE`, `LTREE`, geometric types, multiranges, composite types, PostGIS as GeoJSON, Standard Schema validation. [Guide](https://tormozz48.github.io/postgrelize/guide/models) · [types](docs/examples/types.ts) · [geometry](docs/examples/geometry.ts) · [multirange](docs/examples/multirange.ts) · [composite](docs/examples/composite.ts) · [postgis](docs/examples/postgis.ts)

Looking for one option or method? Use the [option reference](https://tormozz48.github.io/postgrelize/reference/options/) and the [API reference](https://tormozz48.github.io/postgrelize/api/).

## Install

```bash
npm install postgrelize pg
```

The package is published on npmjs.com as `postgrelize`. The former GitHub Packages name `@tormozz48/postgrelize` is deprecated: switch the dependency and your imports to `postgrelize`.

### For LLMs and agents

The package ships `llm/USAGE.md` (a compact, tested usage guide) and an Agent Skill in `skills/postgrelize/`, next to the typed `.d.ts` files with TSDoc. The docs site publishes [`llms.txt`](https://tormozz48.github.io/postgrelize/llms.txt) and [`llms-full.txt`](https://tormozz48.github.io/postgrelize/llms-full.txt). See [Using with LLMs and agents](https://tormozz48.github.io/postgrelize/guide/llm).

## Quick start

Define a model, sync it and run a first query: [Getting started](https://tormozz48.github.io/postgrelize/guide/getting-started) (runnable: [getting-started.ts](docs/examples/getting-started.ts)). Coming from Sequelize? Read [Migrating from Sequelize](https://tormozz48.github.io/postgrelize/guide/migrating).

Guides for the Sequelize v6 API: [models and data types](https://tormozz48.github.io/postgrelize/guide/models) · [associations](https://tormozz48.github.io/postgrelize/guide/associations) · [querying](https://tormozz48.github.io/postgrelize/guide/querying) · [transactions](https://tormozz48.github.io/postgrelize/guide/transactions) · [hooks and validation](https://tormozz48.github.io/postgrelize/guide/hooks-validation) · [errors](https://tormozz48.github.io/postgrelize/guide/errors) · [connection](https://tormozz48.github.io/postgrelize/guide/connection) · [schema and sync](https://tormozz48.github.io/postgrelize/guide/schema).

All examples live in [docs/examples](docs/examples); each one runs in CI.

## Compatibility

- PostgreSQL 16, 17 and 18 (tested in CI); some features need newer servers: `MERGE ... RETURNING` 17+, `returningOld` 18+.
- Node.js 20+ (tested on 20, 22 and 24), `pg` driver.
- A few behaviours intentionally differ from Sequelize v6 where v6 is wrong for PostgreSQL (e.g. `describeTable` defaults to `current_schema()` instead of `public`); see [Sequelize issues fixed in postgrelize](docs/sequelize-issues.md) for the full list.

## Links

- [API reference](https://tormozz48.github.io/postgrelize/)
- [PostgreSQL coverage](https://tormozz48.github.io/postgrelize/postgresql-coverage) — which PostgreSQL 16–18 features are supported, test-backed, planned or out of scope
- [Coverage report](https://tormozz48.github.io/postgrelize/coverage/)
- [Changelog](CHANGELOG.md) — every release and roadmap stage, linked to tags
- [Package versions](https://www.npmjs.com/package/postgrelize) · [Tags](https://github.com/tormozz48/postgrelize/tags)

## Development

```bash
npm ci
npm run db:up        # PostgreSQL 16 in Docker on port 54329
npm run lint && npm run format:check && npm run typecheck
npm test             # unit + integration + differential (vs sequelize@6)
npm run build && npm run test:build
npm run llm:build    # regenerate llm/USAGE.md and skills/ from docs/llm + docs/examples/llm-usage.ts
npm run docs         # documentation site into docs/.vitepress/dist (npm run docs:dev to preview)
npm run test:coverage # coverage report into coverage/
```

The performance gate (`bench/`) also runs on a GitHub runner: the manual workflow `bench gate` compares a ref with the latest tag.

Contribution rules (architecture, tests, documentation sync, releases) are in [AGENTS.md](AGENTS.md). Design records, ADRs and reviews live in `.10x/`.

## License

MIT
