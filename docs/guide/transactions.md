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

| Option           | Description                                                                                                                                                                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `isolationLevel` | `Transaction.ISOLATION_LEVELS.READ_COMMITTED` (PostgreSQL default), `REPEATABLE_READ`, `SERIALIZABLE`, `READ_UNCOMMITTED` (behaves as read committed)                                                                                                     |
| `readOnly`       | Starts the transaction `READ ONLY`. PostgreSQL extension.                                                                                                                                                                                                 |
| `deferrable`     | `true` / `false` adds `DEFERRABLE` / `NOT DEFERRABLE`; see [Deferrable read-only transactions](#deferrable-read-only-transactions). `Deferrable.SET_DEFERRED` / `SET_IMMEDIATE` run `SET CONSTRAINTS`; see [Deferred constraints](#deferred-constraints). |
| `transaction`    | Parent transaction: the new one becomes a savepoint inside it.                                                                                                                                                                                            |
| `settings`       | Settings applied with `SET LOCAL` semantics. PostgreSQL extension, see [Sessions](./sessions#transaction-settings).                                                                                                                                       |
| `logging`        | Logger for the `BEGIN` / `COMMIT` / `ROLLBACK` statements.                                                                                                                                                                                                |
| `type`           | Accepted for v6 compatibility (`DEFERRED`, ...) and ignored.                                                                                                                                                                                              |

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

### CLS namespaces (`cls-hooked`)

Code written for v6 passes a [`cls-hooked`](https://www.npmjs.com/package/cls-hooked) or `continuation-local-storage` namespace: `Sequelize.useCLS(createNamespace('app'))`. postgrelize accepts it (any object with `bind`, `run`, `get` and `set`; `cls-hooked` is not a dependency) and then behaves as v6 does, so helpers that read `namespace.get('transaction')` keep working:

- A managed transaction runs in `namespace.run` and stores itself under the key `transaction`; it clears the key when it finishes, so `afterCommit` hooks see `null`.
- A query without a `transaction` option uses `namespace.get('transaction')`, including a transaction your own code stored there. Code outside the callback sees none.
- As in v6, a nested `sequelize.transaction(callback)` does not join the enclosing one by itself: it opens its own transaction on another connection. Pass `{ transaction: outer }` to get a savepoint. (Without a namespace, `AsyncLocalStorage` mode turns it into a savepoint automatically.)

Anything that is not a namespace (no `bind` or `run`) throws `Must provide CLS namespace`, as in v6; `useCLS()` without an argument keeps the `AsyncLocalStorage` mode.

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

## Deferrable read-only transactions

`deferrable: true` together with `isolationLevel: SERIALIZABLE` and `readOnly: true` starts a `SERIALIZABLE READ ONLY DEFERRABLE` transaction, meant for long reports. PostgreSQL waits for a snapshot that cannot be involved in a serialization failure, then runs the transaction without taking predicate locks and without ever failing with `40001`. The start may be delayed while other serializable transactions finish. For any other transaction PostgreSQL accepts the flag and ignores it; `deferrable` must be a boolean and is ignored for savepoints.

<<< @/examples/transactions.ts#deferrable{ts}

## Deferred constraints

As in v6, `deferrable: Deferrable.SET_DEFERRED` (all constraints) or `Deferrable.SET_DEFERRED(['child_parent_fk'])` (named constraints) runs `SET CONSTRAINTS ... DEFERRED` right after the transaction starts, so deferrable foreign keys are checked at commit; `Deferrable.SET_IMMEDIATE` does the opposite. The constraints must be declared `DEFERRABLE` (see [Schema](./schema)). Names are quoted as identifiers, and `deferrable` accepts only values made by `Deferrable`. `queryInterface.deferConstraints(transaction, { deferrable })` does the same inside a running transaction.

## Errors

Serialization failures, deadlocks and `NOWAIT` lock failures surface as `DatabaseError`; the PostgreSQL error code is on `error.parent.code` (`40001` serialization failure, `40P01` deadlock, `55P03` lock not available). A cancelled statement (`statement_timeout`, code `57014`) throws `TimeoutError`. Retry logic is up to the application, as in v6.

## API reference

- [`Transaction`](/api/classes/Transaction)
- [`TransactionOptions`](/api/type-aliases/TransactionOptions)
- [`Sequelize.transaction`](/api/classes/Sequelize)
