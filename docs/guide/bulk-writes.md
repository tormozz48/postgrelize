# Bulk writes and COPY

Set-based writes avoid loading rows into Node.js and writing them back one by one. postgrelize exposes the PostgreSQL statements for this: `UPDATE ... FROM`, `DELETE ... USING`, `INSERT ... SELECT`, `MERGE`, and `COPY` for bulk import and export. None of them exist in Sequelize v6.

The examples use three models: `Stock` (`sku`, `qty`), `Delivery` (`sku`, `amount`) and `Archive` (`sku`, `qty`):

<<< @/examples/bulk-writes.ts#models{ts}

## `UPDATE ... FROM`

The `from` option of `Model.update` joins other relations, keyed by alias. Reference their columns with `col('alias.attr')` in `where` and with `literal` or `col` in the new values:

<<< @/examples/bulk-writes.ts#update-from{ts}

A `from` value can be a model, a subquery from `Model.subquery()`, or a table / CTE name as a string.

## `DELETE ... USING`

`Model.destroy` takes `using` with the same shape:

<<< @/examples/bulk-writes.ts#destroy-using{ts}

## `INSERT ... SELECT` {#insert-select}

`Model.insertFrom(subquery, { columns })` inserts the rows a subquery produces, without a round trip through Node.js. `columns` lists the target attributes in the order of the subquery columns:

<<< @/examples/bulk-writes.ts#insert-from{ts}

It returns the written rows as instances (with `wasInserted`) and accepts [`onConflict`](./upserts#onconflict), so it can upsert from another table. Fill `NOT NULL` timestamps in the subquery, e.g. `attributes: ['sku', [literal('now()'), 'createdAt']]`.

## `MERGE`

`Model.merge` runs `MERGE INTO ... USING ...` (PostgreSQL 15+): one statement that updates, deletes or inserts depending on whether each source row matches a target row. The source is an array of plain objects (sent as a `VALUES` list with bound parameters) or a subquery:

<<< @/examples/bulk-writes.ts#merge{ts}

- `on` is the join condition; the source alias is `source` unless you pass `as`.
- `whenMatched` and `whenNotMatched` take one action or an array, evaluated in order. Each action may have a `where` condition.
- Matched actions: `{ update: {...} }`, `{ delete: true }` or `{ nothing: true }`. Not-matched actions: `{ insert: true }` (copy same-named source columns), `{ insert: {...} }` or `{ nothing: true }`.
- Timestamps are set automatically. Hooks and validation do not run.
- The result is `{ rowCount, rows }`; `rows` is filled only with `returning: true`.

With a subquery source and an explicit insert map:

<<< @/examples/bulk-writes.ts#merge-subquery{ts}

### `RETURNING` and `NOT MATCHED BY SOURCE` (PostgreSQL 17+)

On PostgreSQL 17, `returning: true` returns each written row with the action taken, and `whenNotMatchedBySource` handles target rows that have no source row — for example to retire items missing from a full import:

<<< @/examples/merge-returning.ts#merge-returning{ts}

On older servers these options throw before any SQL runs. With `returningOld: true` (PostgreSQL 18), each instance also has [`oldValues`](./upserts#old-values-with-returningold-postgresql-18).

## COPY {#copy}

`COPY` is the fastest way to move many rows in or out of PostgreSQL.

### Import with `copyFrom`

`Model.copyFrom(rows, options)` streams rows with `COPY ... FROM STDIN`. `rows` can be an array, an iterable or an async iterable, so you can pipe a file parser or another database cursor through it without holding everything in memory:

<<< @/examples/copy.ts#source{ts}

<<< @/examples/copy.ts#copy-from{ts}

- `columns` lists the attributes to copy. It defaults to the keys of the first row of an array and is required for iterables.
- Values are serialized like in `create` (JSON, arrays, dates); escaping is handled for you.
- `createdAt` / `updatedAt` are filled when the model has timestamps.
- No hooks, validation or defaults defined in Node.js run, and missing values are `NULL` (column defaults of the table do not apply to listed columns). The result is the number of copied rows.
- With `transaction`, the copy is rolled back together with the transaction.

### Export with `copyTo`

`Model.copyTo(options)` runs `COPY (SELECT ...) TO STDOUT` and returns an async iterator of `Buffer` chunks. It takes the find options (`attributes`, `where`, `order`, `include`, scopes, `with`) and the output format:

<<< @/examples/copy.ts#copy-to{ts}

| Option       | Description                                  |
| ------------ | -------------------------------------------- |
| `format`     | `'text'` (default), `'csv'` or `'binary'`    |
| `header`     | Header line with column names (text and CSV) |
| `delimiter`  | Single-character field delimiter             |
| `nullString` | Text written for `NULL`                      |
| `quote`      | Single-character quote (CSV)                 |

Write the chunks straight to an HTTP response or a file stream. Stopping the iteration early is safe: the rest of the output is drained before the connection returns to the pool. Because `COPY` cannot take parameters, values of the query are inlined as escaped literals.

## API reference

- [`Model`](/api/index/classes/Model) — `update`, `destroy`, `insertFrom`, `merge`, `copyFrom`, `copyTo`
- [`UpdateOptions`](/api/index/type-aliases/UpdateOptions), [`DestroyOptions`](/api/index/type-aliases/DestroyOptions), [`JoinSources`](/api/index/type-aliases/JoinSources)
- [`MergeOptions`](/api/index/type-aliases/MergeOptions), [`MergeResult`](/api/index/type-aliases/MergeResult)
- [`CopyFromOptions`](/api/index/type-aliases/CopyFromOptions), [`CopyToOptions`](/api/index/type-aliases/CopyToOptions)
