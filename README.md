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
  <a href="https://github.com/tormozz48/postgrelize/pkgs/npm/postgrelize"><img alt="version" src="https://img.shields.io/github/package-json/v/tormozz48/postgrelize?label=version"></a>
  <a href="https://github.com/tormozz48/postgrelize/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/tormozz48/postgrelize/actions/workflows/ci.yml/badge.svg?branch=main"></a>
  <a href="https://tormozz48.github.io/postgrelize/coverage/"><img alt="coverage" src="https://img.shields.io/endpoint?url=https%3A%2F%2Ftormozz48.github.io%2Fpostgrelize%2Fcoverage%2Fbadge.json"></a>
  <img alt="PostgreSQL 16–18" src="https://img.shields.io/badge/PostgreSQL-16%20%7C%2017%20%7C%2018-336791?logo=postgresql&logoColor=white">
  <img alt="Node.js 20+" src="https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white">
  <a href="https://tormozz48.github.io/postgrelize/"><img alt="docs" src="https://img.shields.io/badge/docs-API%20reference-blue"></a>
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/github/license/tormozz48/postgrelize"></a>
</p>

## Why postgrelize

- **Drop-in for Sequelize v6.** `Sequelize`, `Model`, `DataTypes`, `Op`, hooks, validations, scopes, paranoid models, associations and `include`, transactions, `QueryInterface` and `sync` behave like v6. A differential test suite runs every scenario on both libraries and compares results.
- **PostgreSQL first.** One dialect, so every feature can use PostgreSQL fully instead of the lowest common denominator.
- **Safe by default.** Values are always bound parameters; identifiers are quoted; order directions, cast types and operators are allow-listed.
- **Typed and documented.** Strict TypeScript, TSDoc on every export, [API reference](https://tormozz48.github.io/postgrelize/).

### What you get on top of Sequelize v6

| Area            | postgrelize                                                                                                                                                                                                                    | Sequelize v6                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Upserts         | `onConflict` with any target, expression updates, `WHERE`, `DO NOTHING`; `Model.insert()` with `wasInserted` per row                                                                                                           | `upsert` / `updateOnDuplicate` with fixed column lists |
| Bulk writes     | `MERGE` (`Model.merge`), `UPDATE ... FROM`, `DELETE ... USING`, `INSERT ... SELECT` (`Model.insertFrom`)                                                                                                                       | —                                                      |
| Old values      | `returningOld` → `instance.oldValues` (PostgreSQL 18 `RETURNING OLD`)                                                                                                                                                          | —                                                      |
| Import / export | `COPY FROM STDIN` / `COPY TO STDOUT` streaming (`Model.copyFrom`, `Model.copyTo`)                                                                                                                                              | —                                                      |
| Queries         | CTEs incl. `WITH RECURSIVE`, subqueries (`Model.subquery`, `exists()`), `DISTINCT ON`, window functions (`over()`), row comparison (`tuple()`), server-side cursors (`Model.findEach`), `= ANY($1)` for large `IN` lists       | literals only                                          |
| Sessions        | `LISTEN/NOTIFY`, `SET LOCAL` for RLS, advisory locks                                                                                                                                                                           | —                                                      |
| Scaling         | read replicas with round-robin readers (`replication`, `useMaster`); opt-in named prepared statements (`statementCache`)                                                                                                       | read replicas                                          |
| Models          | optional decorators (`@Table`, `@Column`, `@HasMany`, hook decorators, …) and `sequelize.addModels`, in both TC39 and legacy decorator modes                                                                                   | `Model.init` / `define` only                           |
| Schema          | identity and generated columns, `INTERVAL`, `HSTORE` objects, `LTREE`, `TIMESTAMP`, `MONEY`, `BIT` / `VARBIT`, `XML`, `MACADDR8`, `TSQUERY`, `UNIQUE NULLS NOT DISTINCT`, Standard Schema (zod / valibot / arktype) validation | —                                                      |

## Install

The package is published to GitHub Packages. Add to `.npmrc`:

```
@tormozz48:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Install with an alias to keep `import ... from 'postgrelize'`:

```bash
npm install postgrelize@npm:@tormozz48/postgrelize pg
```

### For LLMs and agents

The package ships `llm/USAGE.md` (a compact, tested usage guide) and an Agent Skill in `skills/postgrelize/`, next to the typed `.d.ts` files with TSDoc. The docs site publishes [`llms.txt`](https://tormozz48.github.io/postgrelize/llms.txt) and [`llms-full.txt`](https://tormozz48.github.io/postgrelize/llms-full.txt). See [Using with LLMs and agents](https://tormozz48.github.io/postgrelize/guide/llm).

## Quick start

```ts
import { DataTypes, Model, Op, Sequelize, excluded, literal } from 'postgrelize';
import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'postgrelize';

const sequelize = new Sequelize(process.env.DATABASE_URL!, { logging: false });

class Counter extends Model<InferAttributes<Counter>, InferCreationAttributes<Counter>> {
  declare id: CreationOptional<number>;
  declare key: string;
  declare hits: number;
  declare version: CreationOptional<number>;
}

Counter.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    key: { type: DataTypes.TEXT, allowNull: false, unique: true },
    hits: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  },
  { sequelize },
);

await sequelize.sync();

// Sequelize v6 API works as before
await Counter.findAll({ where: { hits: { [Op.gte]: 10 } }, order: [['hits', 'DESC']] });

// PostgreSQL extension: expression-based upsert with a condition
const rows = await Counter.insert([{ key: 'home', hits: 1, version: 2 }], {
  onConflict: {
    target: ['key'],
    action: {
      update: { hits: literal('"Counter"."hits" + EXCLUDED."hits"'), version: excluded('version') },
      where: { version: { [Op.lt]: excluded('version') } },
    },
  },
});
rows.forEach((row) => console.log(row.key, row.wasInserted ? 'inserted' : 'updated'));
```

## Compatibility

- PostgreSQL 16, 17 and 18 (tested in CI); some features need newer servers: `MERGE ... RETURNING` 17+, `returningOld` 18+.
- Node.js 20+, `pg` driver.
- A few behaviours intentionally differ from Sequelize v6 where v6 is wrong for PostgreSQL (e.g. `describeTable` defaults to `current_schema()` instead of `public`); see [Sequelize issues fixed in postgrelize](docs/sequelize-issues.md) for the full list.

## Links

- [API reference](https://tormozz48.github.io/postgrelize/)
- [PostgreSQL coverage](https://tormozz48.github.io/postgrelize/postgresql-coverage) — which PostgreSQL 16–18 features are supported, test-backed, planned or out of scope
- [Coverage report](https://tormozz48.github.io/postgrelize/coverage/)
- [Package versions](https://github.com/tormozz48/postgrelize/pkgs/npm/postgrelize) · [Tags](https://github.com/tormozz48/postgrelize/tags)

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

Contribution rules (architecture, tests, documentation sync, releases) are in [AGENTS.md](AGENTS.md). Design records, ADRs and reviews live in `.10x/`.

## License

MIT
