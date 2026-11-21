# Getting started

postgrelize is an ORM for Node.js that implements the [Sequelize v6](https://sequelize.org/docs/v6/) public API for PostgreSQL only. Code written for Sequelize v6 on PostgreSQL runs unchanged in most cases. On top of that, postgrelize exposes PostgreSQL features that Sequelize cannot express: `ON CONFLICT` upserts with expressions, `MERGE`, CTEs, `COPY`, `LISTEN/NOTIFY` and more.

## Requirements

- Node.js 20 or newer
- PostgreSQL 16, 17 or 18 (some features need a newer server; each page says so)
- the [`pg`](https://node-postgres.com/) driver

## Install

Install the package from npmjs.com together with `pg`:

```bash
npm install postgrelize pg
```

Imports read `from 'postgrelize'`, as in every example of this guide. The old GitHub Packages name `@tormozz48/postgrelize` is deprecated.

## Connect

Create one `Sequelize` instance per database and share it across your application. It accepts a connection URI or the usual Sequelize options:

```ts
import { Sequelize } from 'postgrelize';

const sequelize = new Sequelize(process.env.DATABASE_URL!, {
  logging: false,
  pool: { max: 10 },
});

await sequelize.authenticate(); // throws a ConnectionError subclass when the server is unreachable
```

The constructor also takes `(database, username, password, options)` or a single options object with `host`, `port`, `database`, `username`, `password`, `ssl` and `dialectOptions` (passed to the `pg` pool). `dialect` may be omitted; any value other than `'postgres'` is rejected. The session time zone defaults to UTC (`timezone: '+00:00'`), as in Sequelize v6.

Call `sequelize.close()` when the process shuts down.

## Define a model and query it

Models are TypeScript classes. `InferAttributes` and `InferCreationAttributes` derive the attribute types from the `declare`d fields; `CreationOptional` marks attributes that the database fills in.

<<< @/examples/getting-started.ts#imports{ts}

<<< @/examples/getting-started.ts#model{ts}

`sequelize.sync()` creates missing tables. Use it in tests and prototypes; production schemas are usually managed with migrations (see [Schema, sync and migrations](./schema)).

The familiar Sequelize v6 methods work as before:

<<< @/examples/getting-started.ts#crud{ts}

Every example in this guide is executed against PostgreSQL in CI, so the code you see is code that runs.

## Logging

`logging` takes a function receiving each SQL statement (or `false`). With `benchmark: true` the function also receives the execution time in milliseconds. Statements inside a transaction are prefixed with the transaction id:

```ts
const sequelize = new Sequelize(url, { logging: (sql) => logger.debug(sql) });
// Executing (default): SELECT ...
// Executing (6f1c...): INSERT INTO ...
```

All values are sent as bound parameters (`$1`, `$2`, ...), never interpolated into the SQL text.

## Errors

Errors are the Sequelize v6 classes, exported from the package root: `ValidationError`, `UniqueConstraintError`, `ForeignKeyConstraintError`, `ExclusionConstraintError`, `DatabaseError`, `TimeoutError`, `ConnectionRefusedError` and the other `ConnectionError` subclasses, `EmptyResultError`, `OptimisticLockError`. Check them with `instanceof`:

```ts
import { UniqueConstraintError } from 'postgrelize';

try {
  await User.create({ email: 'ann@example.com' });
} catch (error) {
  if (error instanceof UniqueConstraintError) {
    // error.fields: { email: 'ann@example.com' }
  }
}
```

## Next steps

- Coming from Sequelize? Read [Migrating from Sequelize](./migrating).
- Learn the Sequelize v6 API as implemented here: [Models and data types](./models), [Querying](./querying), [Associations](./associations).
- See what PostgreSQL adds: [Upserts and RETURNING](./upserts), [Bulk writes and COPY](./bulk-writes), [Advanced queries](./advanced-queries), [Sessions and scaling](./sessions).
- Browse the [API reference](/api/).
