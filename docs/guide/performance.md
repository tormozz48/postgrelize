# Performance

postgrelize builds SQL, maps rows to instances and runs hooks and validation itself, so its overhead is what you pay on top of PostgreSQL. This page shows what that overhead is compared with Sequelize v6, how it is measured, and what to tune in your application.

## How it compares with Sequelize v6

The benchmark (`bench/`) runs the same scenarios on postgrelize and on `sequelize@6` in one process, alternating which library goes first in every round, and records CPU time per operation (`process.cpuUsage()`). The ratio is stable on a busy machine even when absolute times are not. In **stub mode** the `pg` driver is replaced by an in-memory responder, so only the library's own work is measured:

| Scenario                                      | postgrelize µs/op | v6 ÷ postgrelize |
| --------------------------------------------- | ----------------: | ---------------: |
| `findByPk`                                    |              10.7 |             3.9× |
| `findAll` 100 rows                            |              33.4 |             3.3× |
| `findAll` 10 000 rows                         |             3 228 |             2.0× |
| `findAll` 10 000 rows, `raw: true`            |               940 |             1.0× |
| `findAll` with `include` (belongsTo)          |                92 |             4.2× |
| `findAll` with `include` (hasMany)            |                94 |             1.6× |
| `findAll` with `include` (belongsToMany)      |               126 |             1.5× |
| `findAndCountAll`                             |                34 |             4.0× |
| `where` with nested operators and a JSON path |                27 |             5.0× |
| `where` with `Op.in` of 5 000 values          |               107 |              19× |
| `create`                                      |                18 |             4.3× |
| `bulkCreate` 100 / 1 000 rows                 |       300 / 2 635 |      4.3× / 3.7× |
| `save()` of a changed instance                |              15.7 |             3.8× |
| transaction with 3 queries                    |                33 |             4.7× |
| `build` + `toJSON`                            |               2.1 |             3.1× |
| model definition                              |                17 |             8.3× |

Measured on one developer machine (Node 24; no database involved in stub mode); absolute numbers differ on yours, the ratios are what to compare. Against a real database a statement spends most of its time in the network and in PostgreSQL, so the end-to-end difference is smaller: in database mode postgrelize used 1.1–2.4× less CPU than v6 per operation (`raw: true` reads of 10 000 rows about 1.1× less), and read 10 000 rows at about 255 000 rows/s (344 000 rows/s with `raw: true`).

Run it yourself:

```bash
PGZ_BENCH_STUB=1 npm run bench     # library overhead only, no database
npm run bench                      # real PostgreSQL (PGZ_TEST_URL or the docker default)
```

## Tuning your application

### Pool size

Every statement needs a pooled connection, so `pool.max` is the concurrency limit of one Node.js process. A value close to the number of cores of the _database_ server divided by the number of application processes is a good start; more connections than the server can run in parallel only add queueing and memory use on the server.

<<< @/examples/performance.ts#pool{ts}

### Load less

Instances cost allocation and change tracking; rows you do not need cost network and parsing time. For read-only paths:

<<< @/examples/performance.ts#read{ts}

- `attributes` limits the columns PostgreSQL sends.
- `raw: true` returns plain objects: no instance construction, getters or change tracking. It is about 3× faster than building instances for large reads.
- `limit` / `offset`, or a cursor (`findEach`, see [Advanced queries](./advanced-queries)), keep result sets bounded.

Let PostgreSQL aggregate:

<<< @/examples/performance.ts#count{ts}

### Write in bulk

One statement for many rows beats a loop of `create` calls by a wide margin, because every `create` is a round trip:

<<< @/examples/performance.ts#bulk{ts}

- `bulkCreate` sends one multi-row `INSERT`. Pass `validate: false` when the rows are already trusted.
- For imports of many thousands of rows use `Model.copyFrom` (`COPY ... FROM STDIN`); see [Bulk writes and COPY](./bulk-writes).
- Use `UPDATE ... FROM`, `INSERT ... SELECT` and `MERGE` ([Bulk writes and COPY](./bulk-writes)) to change data without moving it through Node.js.
- Upserts: [`onConflict`](./upserts) instead of "find, then create or update".

### Transactions and includes

- Group dependent writes in one transaction ([Transactions](./transactions)): one `BEGIN`/`COMMIT` pair instead of one implicit transaction per statement.
- Prefer `include` over a query per parent row. Joined `hasMany` and `belongsToMany` includes multiply result rows; for large hasMany collections use `separate: true` on the include (see [Associations](./associations)) or query the child model directly.
- Large `Op.in` lists are cheap to build, but PostgreSQL limits a statement to 65 535 bound values; split larger lists or join against a `VALUES` list / subquery.

### Read replicas

Read-only traffic can go to replicas ([Sessions and scaling](./sessions)); the pool of each replica has its own limit.

### Prepared statements <Ext />

By default every query is sent as an unnamed statement, so PostgreSQL parses and plans it on each call. The `statementCache` constructor option names repeated statements so each connection parses and plans them once:

<<< @/examples/performance.ts#statement-cache{ts}

- Only `SELECT`, `INSERT`, `UPDATE`, `DELETE` and `WITH` texts of at most 8192 characters are named. Multi-statement texts, DDL, `COPY`, `LISTEN` / `NOTIFY` and cursors stay unnamed. The name is `pgz_` plus a hash of the SQL text; values are still bound as `$n` parameters.
- Each connection names at most `max` statements (default 100); further texts run unnamed. There is no eviction: statements disappear with the connection (`pool.maxUses` and `pool.idle` recycle them). Keep `pool.max` bounded: server memory is `pool.max × max` statements.
- Texts that vary per call (long `IN` lists, dynamic `where` shapes) fill the slots without being reused; the cache pays off for a small set of hot, repeated queries (`findByPk`, counts, single-row writes).
- After a schema change that alters a result's columns, PostgreSQL rejects the cached statement with "cached plan must not change result type". Outside a transaction the query is retried once unnamed and that text stays unnamed on that connection; inside a transaction the error is thrown like any other.
- Not for PgBouncer in transaction pooling mode (without protocol-level prepared statement support). The gain is visible only against a real database; the `findByPk statementCache` case of `npm run bench` shows it.

## What the library does for you

Query building, SQL text assembly and row mapping are optimised for the common paths: columns of a model are resolved once and reused, rows are converted without per-row lookups, hooks and validators that are not defined cost almost nothing, and identifier quoting is cached. None of it changes SQL text or Sequelize v6 behaviour. If you find a case where postgrelize is slower than v6, [open an issue](https://github.com/tormozz48/postgrelize/issues) with the scenario; the benchmark in `bench/scenarios.ts` is the place to add it.
