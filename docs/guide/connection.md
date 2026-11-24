# Connection, pool and logging

One `Sequelize` instance owns one connection pool (or one pool per replica, see [read replicas](./sessions#read-replicas)). Create it once, share it across the application and call `sequelize.close()` on shutdown. Every option of the constructor is listed with its type and default in the [connection option reference](/reference/options/connection#sequelizeoptions); this page shows how they fit together.

## Connection URI

A URI carries host, port, database and credentials. Options given next to it override the values in the URI:

<<< @/examples/connection.ts#url{ts}

`authenticate()` runs `SELECT 1` and rejects with a [`ConnectionError`](./errors) subclass when the server cannot be reached, so it is a good startup check.

## Options object

The same settings can be given as separate options, together with the pool, session and model defaults:

<<< @/examples/connection.ts#options{ts}

| Option                     | What it does                                                                                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dialect`                  | Optional; the only accepted value is `'postgres'`.                                                                                                         |
| `ssl`                      | TLS settings passed to `pg` (`true`, or `{ ca, rejectUnauthorized, ... }`). `dialectOptions` takes any other `pg` pool setting.                            |
| `pool`                     | `max` (default 5), `idle` (10 000 ms), `acquire` (60 000 ms, then `ConnectionAcquireTimeoutError`), `maxUses`. `min` and `evict` are accepted and ignored. |
| `timezone`                 | Session time zone; default `'+00:00'`.                                                                                                                     |
| `define`                   | Defaults for every model: `timestamps`, `underscored`, `freezeTableName`, `paranoid`, ...                                                                  |
| `minifyAliases`            | Shorten generated aliases of deep includes to stay inside PostgreSQL's 63-byte identifier limit.                                                           |
| `hooks`                    | Sequelize-level [hooks](./hooks-validation#sequelize-level-hooks) for every model.                                                                         |
| `retry`                    | Retry failed connection acquisition and transaction starts; see [retrying](./sessions#retrying-failed-queries).                                            |
| `replication`              | Read replicas and a writer; see [read replicas](./sessions#read-replicas).                                                                                 |
| `statementCache` <Ext />   | Opt-in named prepared statements, bounded per connection; see [performance](./performance#prepared-statements).                                            |
| `inAsAnyThreshold` <Ext /> | Length from which `IN (...)` lists compile to `= ANY($1)`, so one statement text serves every list length.                                                 |

## Logging

`logging` receives the SQL text of every executed query with the values inlined as literals, like Sequelize v6, so a logged statement can be run as it is. The query itself is still sent to the server with bound parameters; the second argument is `{ bind, parameterizedSql }` (the bound values and the statement as sent, `$1`, `$2`, …; `parameterizedSql` is a postgrelize extension). Use `false` to silence it and `benchmark: true` to receive the duration in milliseconds as the second argument. A per-query `logging` option overrides the instance value.

<<< @/examples/connection.ts#logging{ts}

## Prepared statements and long `IN` lists <Ext />

Two constructor options exist only in postgrelize. `statementCache` turns on named prepared statements, `inAsAnyThreshold` makes long `IN` lists use one statement shape:

<<< @/examples/connection.ts#statement-cache{ts}

## Pool counters and shutdown

`sequelize.connectionManager.pool` reports live `size`, `available`, `using`, `waiting` and `maxSize`; useful for health checks. The routing and raw-connection details are in [Sessions and scaling](./sessions#routing-connections).

<<< @/examples/connection.ts#lifecycle{ts}

## API reference

- [`Sequelize`](/api/classes/Sequelize), [`SequelizeOptions`](/api/type-aliases/SequelizeOptions), [`PoolOptions`](/api/type-aliases/PoolOptions)
- [`ConnectionManagerContract`](/api/interfaces/ConnectionManagerContract), [`ConnectionPool`](/api/interfaces/ConnectionPool), [`PoolCounters`](/api/interfaces/PoolCounters)
