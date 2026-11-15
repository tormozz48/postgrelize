# Transactions

`sequelize.transaction()` works as in Sequelize v6: managed transactions with a callback, unmanaged transactions you commit yourself, savepoints for nested transactions, isolation levels, row locks, `afterCommit` hooks and optional CLS. Session settings and advisory locks are PostgreSQL extensions described in [Sessions and scaling](./sessions).

The examples use an `Account` model with `owner` and `balance` columns.

## Managed transactions

Pass a callback: the transaction commits when the callback resolves and rolls back when it throws. The result of the callback is returned. Pass `transaction` to every query that should run inside it:

<<< @/examples/transactions.ts#managed{ts}

## Unmanaged transactions

Without a callback, `transaction()` resolves to a started `Transaction`. Commit or roll it back yourself:

<<< @/examples/transactions.ts#unmanaged{ts}

`afterCommit` callbacks run after a successful commit and are skipped on rollback. Committing or rolling back a finished transaction throws.

Options of `sequelize.transaction(options)`:

| Option           | Description                                                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `isolationLevel` | `Transaction.ISOLATION_LEVELS.READ_COMMITTED` (PostgreSQL default), `REPEATABLE_READ`, `SERIALIZABLE`, `READ_UNCOMMITTED` (behaves as read committed) |
| `readOnly`       | Starts the transaction `READ ONLY`. PostgreSQL extension.                                                                                             |
| `transaction`    | Parent transaction: the new one becomes a savepoint inside it.                                                                                        |
| `settings`       | Settings applied with `SET LOCAL` semantics. PostgreSQL extension, see [Sessions](./sessions#transaction-settings).                                   |
| `logging`        | Logger for the `BEGIN` / `COMMIT` / `ROLLBACK` statements.                                                                                            |
| `type`           | Accepted for v6 compatibility (`DEFERRED`, ...) and ignored.                                                                                          |

## Savepoints

A transaction started with `{ transaction: parent }` is a savepoint. When it fails, only its work is rolled back and the parent can continue:

<<< @/examples/transactions.ts#savepoints{ts}

## CLS

As in v6, `Sequelize.useCLS()` makes queries inside a managed transaction callback pick up the transaction automatically, without the `transaction` option. postgrelize uses Node.js `AsyncLocalStorage`, so no namespace argument is needed:

```ts
Sequelize.useCLS();

await sequelize.transaction(async () => {
  await Account.update({ balance: 0 }, { where: { owner: 'ann' } }); // runs in the transaction
});
```

CLS is a global switch for all `Sequelize` instances in the process. Nested `sequelize.transaction()` calls inside a CLS transaction become savepoints.

## Row locks

`lock` adds a locking clause to a `SELECT`; it must run inside a transaction. `skipLocked: true` skips rows locked by others (useful for job queues), and `noWait: true` fails immediately instead of waiting:

<<< @/examples/transactions.ts#locking{ts}

| `lock` value                                      | SQL                       |
| ------------------------------------------------- | ------------------------- |
| `true` or `Transaction.LOCK.UPDATE`               | `FOR UPDATE`              |
| `Transaction.LOCK.NO_KEY_UPDATE`                  | `FOR NO KEY UPDATE`       |
| `Transaction.LOCK.SHARE`                          | `FOR SHARE`               |
| `Transaction.LOCK.KEY_SHARE`                      | `FOR KEY SHARE`           |
| `{ level: Transaction.LOCK.UPDATE, of: Account }` | `FOR UPDATE OF "Account"` |

`noWait` is a PostgreSQL extension; Sequelize v6 has no way to express `NOWAIT`.

## Read-only transactions

`readOnly: true` makes PostgreSQL reject every write in the transaction. On a [read replica setup](./sessions#read-replicas) the transaction still runs on the writer.

<<< @/examples/transactions.ts#read-only{ts}

## Errors

Serialization failures, deadlocks and `NOWAIT` lock failures surface as `DatabaseError`; the PostgreSQL error code is on `error.parent.code` (`40001` serialization failure, `40P01` deadlock, `55P03` lock not available). A cancelled statement (`statement_timeout`, code `57014`) throws `TimeoutError`. Retry logic is up to the application, as in v6.

## API reference

- [`Transaction`](/api/index/classes/Transaction)
- [`TransactionOptions`](/api/index/type-aliases/TransactionOptions)
- [`Sequelize.transaction`](/api/index/classes/Sequelize)
