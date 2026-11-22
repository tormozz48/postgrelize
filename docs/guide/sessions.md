# Sessions and scaling

PostgreSQL features that work at the connection or transaction level: `LISTEN` / `NOTIFY`, transaction-local settings (for row-level security and timeouts), advisory locks, and read replicas.

## LISTEN / NOTIFY

`sequelize.listen(channel, handler)` subscribes to notifications and resolves to an unsubscribe function. `sequelize.notify(channel, payload)` sends one with `pg_notify`; objects are sent as JSON text:

<<< @/examples/sessions.ts#listen-notify{ts}

- All `listen` calls of a `Sequelize` instance share one dedicated connection outside the pool. It re-subscribes automatically after the connection is lost; notifications sent while it was down are not delivered.
- The handler receives the payload as a string (`undefined` for an empty payload) and the channel name. Parse JSON yourself.
- `notify` inside a transaction is delivered when the transaction commits, and dropped on rollback — use this to announce committed changes.
- PostgreSQL limits a payload to about 8000 bytes; send ids, not documents.
- `sequelize.close()` closes the listener connection too.

## Transaction settings

The `settings` option of `sequelize.transaction()` applies configuration parameters for the duration of the transaction (`set_config(name, value, true)`, the same as `SET LOCAL`). They are reset when the transaction ends, so pooled connections never leak them:

<<< @/examples/sessions.ts#settings{ts}

Typical uses:

- **Row-level security.** Policies read the current user from a custom setting:

  ```sql
  CREATE POLICY tenant_isolation ON documents
    USING (tenant_id = current_setting('app.tenant_id')::int);
  ```

  ```ts
  await sequelize.transaction({ settings: { 'app.tenant_id': tenantId } }, async (transaction) => {
    return Document.findAll({ transaction }); // only this tenant's rows
  });
  ```

- **Per-transaction limits:** `statement_timeout`, `lock_timeout`, `idle_in_transaction_session_timeout`.

Names and values are sent as bound parameters. Custom setting names need a dot (`app.user_id`).

## Statement timeout per query

The `statementTimeout` option (milliseconds, a non-negative integer; `0` disables the limit) applies `statement_timeout` to one query. PostgreSQL cancels a longer statement and the call rejects with a `DatabaseError` (code `57014`). It works on `sequelize.query` and on model finders and writers:

<<< @/examples/sessions.ts#statement-timeout{ts}

Outside a transaction the query runs in its own short transaction, so the value never leaks to the pooled connection. Inside a transaction the previous timeout (for example from `settings`) is restored after the query. To limit a whole transaction use the `settings` option above; to limit every query of the pool use `dialectOptions.statement_timeout`.

## Advisory locks

Advisory locks are application-defined locks managed by PostgreSQL — for example to make sure only one worker runs a job. postgrelize uses transaction-level locks (`pg_advisory_xact_lock`), which are released automatically on commit or rollback, so a crashed worker cannot leave a lock behind.

Keys are integers (64-bit, `number` or `bigint`) or strings; a string is hashed with PostgreSQL's `hashtextextended`.

<<< @/examples/sessions.ts#advisory-locks{ts}

- `transaction.advisoryLock(key)` waits until the lock is free.
- `transaction.tryAdvisoryLock(key)` returns `false` immediately when another session holds the lock.
- Both take `{ shared: true }` for a shared lock: shared holders do not block each other, only exclusive ones.

`sequelize.withAdvisoryLock(key, run, options?)` wraps the common case: it starts a transaction, takes the lock, runs the callback and commits. Concurrent callers with the same key run one after another:

<<< @/examples/sessions.ts#with-advisory-lock{ts}

## Read replicas

The `replication` option of Sequelize v6 is supported. Reads go to the readers in round-robin order; writes go to the writer:

```ts
const sequelize = new Sequelize({
  database: 'app',
  username: 'app',
  password: process.env.DB_PASSWORD,
  replication: {
    read: [{ host: 'replica-1.internal' }, { host: 'replica-2.internal' }],
    write: { host: 'primary.internal' },
  },
});
```

Each member inherits missing settings (`port`, `database`, `username`, `password`) from the top-level options, and each has its own pool with the `pool` settings.

<<< @/examples/sessions.ts#replication{ts}

Routing rules:

- Finders, `count` and other aggregates, `copyTo`, and `sequelize.query` with `type: QueryTypes.SELECT` use a reader.
- Everything else (writes, DDL, `copyFrom`, `listen` / `notify`) uses the writer.
- Queries with `transaction` always use the writer, as does `useMaster: true`.

Replicas lag behind the primary. To read your own writes immediately, pass `useMaster: true` or read inside the writing transaction. There is no automatic failover: a failing reader surfaces as a `ConnectionError`, as in v6.

## Routing connections

`sequelize.connectionManager` is the Sequelize v6 object that hands out pooled connections. Its two methods are the whole contract:

- `getConnection(options?: { type?: 'read' | 'write'; useMaster?: boolean; uuid?: string })` returns a connection (the pooled `pg` client). `type: 'read'` selects a read replica when one is configured and `useMaster` is not set. `uuid` is the id of the transaction the connection is for.
- `releaseConnection(connection)` gives a connection back to the pool it came from.

Every query, finder, write, managed or unmanaged transaction, `findEach`, `copyFrom` / `copyTo`, advisory lock and `sync` acquires through `getConnection` and releases through `releaseConnection`, looked up on the manager at call time. A transaction takes one connection when it starts and releases it on commit or rollback. As in v6, you can reassign both methods on the instance to route connections, for example each request to one of several databases chosen from an `AsyncLocalStorage` value:

<<< @/examples/sessions.ts#connection-routing{ts}

Rules for a replacement:

- Keep acquire and release paired: whatever `getConnection` returns must reach `releaseConnection` exactly once per use. Releasing the same connection twice is ignored.
- Release a connection to the pool that owns it. A connection from another `Sequelize` instance's manager works on this instance's queries and transactions, but only that instance's `releaseConnection` returns it to its pool; remember the owner (a `WeakMap` keyed by the connection, as above).
- Wrap the original methods (`manager.getConnection.bind(manager)`) to fall back to the default pool.

`listen` does not go through the manager: it opens a dedicated connection outside the pool, from this instance's own settings, so it is not routed. Hooks such as `beforePoolAcquire` are not run (see [migrating](/guide/migrating)).

## API reference

- [`Sequelize`](/api/classes/Sequelize) — `listen`, `notify`, `withAdvisoryLock`
- [`Transaction`](/api/classes/Transaction) — `advisoryLock`, `tryAdvisoryLock`
- [`TransactionOptions`](/api/type-aliases/TransactionOptions), [`AdvisoryLockKey`](/api/type-aliases/AdvisoryLockKey)
- [`ConnectionManagerContract`](/api/interfaces/ConnectionManagerContract), [`GetConnectionOptions`](/api/type-aliases/GetConnectionOptions), `Sequelize#connectionManager`
- [`ReplicationOptions`](/api/type-aliases/ReplicationOptions), [`NotificationHandler`](/api/type-aliases/NotificationHandler)
