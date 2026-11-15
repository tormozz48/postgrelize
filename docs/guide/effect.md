# Effect API

postgrelize uses [Effect](https://effect.website) inside its connection and transaction layer, and exposes the main operations as Effect programs from a separate entry point, `postgrelize/effect`. The Promise-based Sequelize v6 API is unchanged; the Effect API is optional.

<<< @/examples/effect.ts#imports{ts}

## Operations

Every function takes the model (or the `Sequelize` instance) as its first argument and returns an `Effect`:

| Function                                | Promise equivalent          |
| --------------------------------------- | --------------------------- |
| `findAll`, `findOne`, `findByPk`        | `Model.findAll`, ...        |
| `count`                                 | `Model.count`               |
| `create`, `bulkCreate`, `insert`        | `Model.create`, ...         |
| `upsert`, `update`, `destroy`           | `Model.upsert`, ...         |
| `query`                                 | `sequelize.query`           |
| `transaction(sequelize, use, options?)` | `sequelize.transaction(fn)` |

The error channel holds the Sequelize v6 error classes (`DatabaseError`, `UniqueConstraintError`, `ValidationError`, `EmptyResultError` for `findOne({ rejectOnEmpty: true })`, ...), so failures can be handled with the usual Effect combinators. Other errors — an invalid option, or an exception thrown by your own hook — are defects.

`findAll`, `findOne`, `findByPk` and `count` run natively as Effect programs (hooks, query, row mapping, `separate` includes) without a Promise round trip; model hooks (`beforeFind`, `afterFind`, `beforeCount`, ...) run exactly as with the Promise API. The write operations still delegate to the Promise implementation.

<<< @/examples/effect.ts#operations{ts}

## Transactions

`transaction` begins a transaction, runs your program, commits when it succeeds and rolls back when it fails **or is interrupted** (a timeout, a cancelled request, a lost race). The pooled connection is always released. Pass the transaction to each operation with `{ transaction }`: continuation-local storage (`Sequelize.useCLS()`) does not follow Effect fibers.

<<< @/examples/effect.ts#transaction{ts}

<<< @/examples/effect.ts#run{ts}

Transaction options are the same as for `sequelize.transaction()`: `isolationLevel`, `readOnly`, `settings` (`SET LOCAL` values for row-level security) and a parent `transaction` for savepoints.

## Performance

Effect runs only at the edges (acquiring connections, running statements, transactions); SQL building and row mapping are plain functions. The overhead is about 1 µs per statement, measured with the in-repository benchmark (`bench/`).

## API reference

- [`postgrelize/effect`](/api/effect/)
