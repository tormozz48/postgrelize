# Transactions and sessions

## Managed and unmanaged

<<< @/examples/transactions.ts#managed{ts}

<<< @/examples/transactions.ts#unmanaged{ts}

## Savepoints

<<< @/examples/transactions.ts#savepoints{ts}

## Row locks

<<< @/examples/transactions.ts#locking{ts}

## CLS

<<< @/examples/llm-usage.ts#cls{ts}

## Settings, LISTEN/NOTIFY, advisory locks

<<< @/examples/sessions.ts#settings{ts}

<<< @/examples/sessions.ts#listen-notify{ts}

<<< @/examples/sessions.ts#advisory-locks{ts}

Routing connections (v6 `sequelize.connectionManager`): every query, transaction, COPY and `sync` takes its connection from `connectionManager.getConnection(options?)` and returns it through `connectionManager.releaseConnection(connection)`, looked up at call time, so both can be reassigned on the instance (for example to pick a database per request from an `AsyncLocalStorage`):

<<< @/examples/sessions.ts#connection-routing{ts}

Keep acquire/release paired and release a connection to the pool that owns it (it may come from another `Sequelize` instance's manager). `listen` uses its own dedicated connection and is not routed.

Raw connections and pool gauges: `getConnection({ type: 'read' })` returns a replica connection (writer without `replication` or with `useMaster`), `releaseConnection(c)` returns it to its own pool, `destroyConnection(c)` drops a broken one (the pool opens a replacement on demand), and `connectionManager.pool` gives live `size`, `available`, `using`, `waiting`, `maxSize` (with `replication`: totals plus `pool.read` / `pool.write`):

<<< @/examples/sessions.ts#connection-pool{ts}

Retry (v6 `retry`): `new Sequelize({ retry: { max: 5, match: [/SequelizeConnectionRefusedError/], backoffBase: 100 } })` or per query `{ retry: {...} }` (merged over the instance option) repeats a failed query, and the connection acquisition plus `BEGIN` of a transaction. Nothing is retried without `max`; an empty `match` retries every error; a statement inside an open transaction, `COMMIT`, COPY and `listen` are never retried.

<<< @/examples/sessions.ts#retry{ts}

Read replicas: `new Sequelize({ replication: { read: [...], write } })` routes reads to replicas; see <https://tormozz48.github.io/postgrelize/guide/sessions>.
