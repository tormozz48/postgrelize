# postgrelize

PostgreSQL-only ORM for Node.js with a public API compatible with [Sequelize v6](https://sequelize.org/docs/v6/), plus first-class PostgreSQL features.

- **Drop-in:** `Sequelize`, `Model`, `DataTypes`, `Op`, hooks, validations, scopes, paranoid models, associations and `include`, transactions, `QueryInterface` and `sync` behave like Sequelize v6 — verified by differential tests that run every scenario on both libraries.
- **PostgreSQL first:** expression-based `INSERT ... ON CONFLICT` (`onConflict`, `Model.insert()`, `wasInserted`), `IS DISTINCT FROM`, jsonb key operators, `= ANY($1)` for large `IN` lists, `DELETE ... RETURNING`, `NOWAIT`, `UNIQUE NULLS NOT DISTINCT`, Standard Schema (zod/valibot/arktype) validation.
- **Safe by default:** values are always bound parameters; identifiers are quoted; order directions, cast types and operators are allow-listed.
- TypeScript-first, fully typed and documented API ([docs](https://tormozz48.github.io/postgrelize/)). PostgreSQL 16+, Node.js 20+.

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

## Usage

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

## Development

```bash
npm ci
npm run db:up        # PostgreSQL 16 in Docker on port 54329
npm run lint && npm run format:check && npm run typecheck
npm test             # unit + integration + differential (vs sequelize@6)
npm run build && npm run test:build
npm run docs         # API docs into docs-site/
```

Design records, ADRs and reviews live in `.10x/`.

## License

MIT
