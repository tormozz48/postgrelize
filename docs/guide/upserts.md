# Upserts and RETURNING

Sequelize v6 can upsert only with fixed column lists (`upsert`, `bulkCreate({ updateOnDuplicate })`). postgrelize keeps those and adds the `onConflict` option, which exposes the full `INSERT ... ON CONFLICT` clause of PostgreSQL: any conflict target, expression updates, a `WHERE` condition and `DO NOTHING`. `Model.insert()` returns every written row with a flag telling whether it was inserted or updated.

The examples use this model, with a composite unique key and a partial unique index:

<<< @/examples/upserts.ts#model{ts}

## Sequelize v6 upserts

These work unchanged:

<<< @/examples/upserts.ts#v6{ts}

`upsert` picks the conflict target from the unique keys of the given attributes (or the primary key); `conflictFields` sets it explicitly. As in Sequelize v6 on PostgreSQL, the second element of the result is `null`. `bulkCreate` takes `updateOnDuplicate`, `conflictAttributes`, `conflictWhere` (for partial indexes) and `ignoreDuplicates`.

## `onConflict`

`onConflict` is accepted by `Model.insert`, `create`, `bulkCreate`, `upsert` and [`insertFrom`](./bulk-writes#insert-select). It has two parts:

```ts
onConflict: {
  target: ['tenant', 'key'],      // or { constraint: 'name' }, or { columns, where } for partial indexes
  action: 'nothing',              // or { update: [...attributes] | { attr: value | expression }, where? }
}
```

### Expression updates and `wasInserted`

`Model.insert(rows, options)` inserts one row or an array of rows and returns model instances for every row written. `instance.wasInserted` is `true` for inserted rows and `false` for rows updated on conflict:

<<< @/examples/upserts.ts#increment{ts}

Inside `action.update`, `EXCLUDED` is the proposed row and the model name is the alias of the existing row. Use `excluded('attr')` for a column of the proposed row, `col('Counter.attr')` for the existing one, and `fn` / `literal` for anything else. `updatedAt` is set automatically.

### Conditional updates

`action.where` adds `DO UPDATE ... WHERE`. Rows that fail the condition are left alone and are not returned:

<<< @/examples/upserts.ts#conditional{ts}

This is the usual pattern for "apply only newer versions" in sync jobs and event consumers.

### Conflict targets

| `target`                                           | SQL                                                    |
| -------------------------------------------------- | ------------------------------------------------------ |
| `['tenant', 'key']`                                | `ON CONFLICT ("tenant", "key")`                        |
| `[fn('lower', col('email'))]`                      | `ON CONFLICT (lower("email"))` — expression index      |
| `{ columns: ['key'], where: { archived: false } }` | `ON CONFLICT ("key") WHERE ...` — partial unique index |
| `{ constraint: 'counters_tenant_key' }`            | `ON CONFLICT ON CONSTRAINT "counters_tenant_key"`      |
| omitted (only with `action: 'nothing'`)            | `ON CONFLICT DO NOTHING` — any unique violation        |

<<< @/examples/upserts.ts#targets{ts}

With `action: 'nothing'`, skipped rows are not returned: `bulkCreate` and `insert` resolve to the inserted rows only. `create` with `action: 'nothing'` returns the unsaved instance (`isNewRecord` stays `true`) when the row was skipped.

Options are checked before any SQL runs: an unknown attribute, an `update` without a `target`, an empty update list, or `onConflict` combined with `ignoreDuplicates` / `updateOnDuplicate` throws an `Error`.

### `upsert` with `onConflict`

With `onConflict`, `upsert` resolves to `[instance, created]` with a real boolean:

<<< @/examples/upserts.ts#upsert-on-conflict{ts}

## RETURNING

PostgreSQL returns written rows with `RETURNING`. Besides `create` and `save` (which always read the row back), postgrelize supports:

- `Model.update(values, { where, returning: true })` → `[count, instances]` (as in v6);
- `Model.destroy({ where, returning: true })` → the deleted instances instead of a count (an extension).

<<< @/examples/upserts.ts#returning{ts}

## Old values with `returningOld` (PostgreSQL 18+)

PostgreSQL 18 can return the row as it was before the statement (`RETURNING OLD.*`). With `returningOld: true`, every returned instance gets `oldValues`: the attribute values before the write, or `null` when the row was inserted.

<<< @/examples/returning-old.ts#update{ts}

<<< @/examples/returning-old.ts#upsert{ts}

`returningOld` is accepted by `Model.update` (together with `returning: true`), `Model.insert`, `insertFrom` and `merge` (with `returning: true`). On PostgreSQL 16 and 17 it throws `returningOld requires PostgreSQL 18 or newer` before running the query.

## API reference

- [`Model`](/api/classes/Model) — `insert`, `upsert`, `bulkCreate`, `wasInserted`, `oldValues`
- [`OnConflictOptions`](/api/type-aliases/OnConflictOptions), [`InsertOptions`](/api/type-aliases/InsertOptions)
- [`excluded`](/api/functions/excluded)
