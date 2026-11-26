# Errors

postgrelize throws the Sequelize v6 error classes, exported from the package root, so `instanceof` checks and `error.name` strings from v6 code keep working. Constraint violations, validation failures, timeouts and connection problems each have their own class; everything the server rejects that has no specific class is a `DatabaseError`. The original `pg` error is always available as `error.parent` (also `error.original`), with the PostgreSQL error `code`, `constraint`, `table`, `detail` and the rest of its fields.

## Class hierarchy

| Class                                                                                                                              | Thrown when                                                                                                                                                 | Useful fields                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `ValidationError`                                                                                                                  | A model validator, `allowNull: false` or a type check fails before the query runs                                                                           | `errors` (`ValidationErrorItem[]`: `path`, `message`, `type`, `value`, `origin`) |
| `UniqueConstraintError` (extends `ValidationError`)                                                                                | `23505` unique violation                                                                                                                                    | `fields`, `errors`, `parent`, `sql`                                              |
| `DatabaseError`                                                                                                                    | Any other server error                                                                                                                                      | `parent` (the `pg` error, `parent.code`), `sql`, `parameters`                    |
| `ForeignKeyConstraintError` (extends `DatabaseError`)                                                                              | `23503` foreign key violation                                                                                                                               | `table`, `fields`, `index` (constraint name)                                     |
| `ExclusionConstraintError` (extends `DatabaseError`)                                                                               | `23P01` exclusion violation                                                                                                                                 | `constraint`, `fields`, `table`                                                  |
| `UnknownConstraintError` (extends `DatabaseError`)                                                                                 | Exported for v6 compatibility (a constraint that does not exist was referenced); the library itself reports a missing constraint as a plain `DatabaseError` | `constraint`, `table`                                                            |
| `TimeoutError` (extends `DatabaseError`)                                                                                           | `57014` the statement was cancelled (`statement_timeout`, [`statementTimeout`](./sessions#statement-timeout-per-query))                                     | as `DatabaseError`                                                               |
| `EmptyResultError`                                                                                                                 | `rejectOnEmpty` found no row                                                                                                                                |                                                                                  |
| `OptimisticLockError`                                                                                                              | Saving a stale instance of a model with `version: true`                                                                                                     | `modelName`, `where`, `values`                                                   |
| `ConnectionError` and subclasses                                                                                                   | The connection could not be made or was lost                                                                                                                | `parent`                                                                         |
| `AggregateError`, `BulkRecordError`, `EagerLoadingError`, `InstanceError`, `AssociationError`, `SequelizeScopeError`, `QueryError` | Library-level problems: failed bulk records, bad `include`, wrong instance use, unknown scope                                                               | per class                                                                        |

`ConnectionError` subclasses: `ConnectionRefusedError`, `AccessDeniedError`, `HostNotFoundError`, `HostNotReachableError`, `InvalidConnectionError`, `ConnectionTimedOutError`, `ConnectionAcquireTimeoutError` (the pool had no free connection within `pool.acquire`). The `error.name` of each keeps the v6 spelling (`SequelizeUniqueConstraintError`, ...).

## Unique violations

`fields` maps the violated columns to the offered values, and `errors` has one `ValidationErrorItem` per column, so the same code can show per-field messages for both validation and unique failures:

<<< @/examples/errors.ts#unique{ts}

## Foreign key violations

<<< @/examples/errors.ts#foreign-key{ts}

## Validation errors

Validators run before the query; the error lists every failing attribute, not just the first. See [Hooks and validation](./hooks-validation#validators) for the validators themselves.

<<< @/examples/errors.ts#validation{ts}

## Missing rows

`findOne`, `findByPk` and `findAll` resolve to `null` or `[]` by default. Pass `rejectOnEmpty: true` (or an error instance or class to throw your own) to the query or to the model options to turn a missing row into an exception:

<<< @/examples/errors.ts#not-found{ts}

## Optimistic locking

Set `version: true` in the model options and every update becomes `UPDATE ... WHERE id = $1 AND version = $2`. A second writer holding an older copy gets an `OptimisticLockError` instead of silently overwriting the first:

<<< @/examples/errors.ts#optimistic-lock{ts}

## Timeouts <Ext />

`statementTimeout` is a postgrelize option that cancels one slow statement on the server and throws `TimeoutError`; the connection stays usable for the next query. `TimeoutError` is a `DatabaseError`, so a generic handler still catches it.

<<< @/examples/errors.ts#timeout{ts}

## Any other server error

Everything without a dedicated class is a `DatabaseError`. Branch on `error.parent.code` (the SQLSTATE) when you need to tell them apart: `40001` serialization failure and `40P01` deadlock (retry the whole transaction), `55P03` lock not available (`noWait`), `22012` division by zero, `42P01` undefined table.

<<< @/examples/errors.ts#database-error{ts}

Retrying is up to the application, or use the [`retry` option](./sessions#retrying-failed-queries) for connection and transaction-start failures. Errors inside a [transaction](./transactions#errors) abort it: roll back and run the transaction again.

## API reference

- [`Error`](/api/classes/Error) (the base class, also exported as `BaseError`), [`ValidationError`](/api/classes/ValidationError), [`ValidationErrorItem`](/api/classes/ValidationErrorItem), [`UniqueConstraintError`](/api/classes/UniqueConstraintError)
- [`DatabaseError`](/api/classes/DatabaseError), [`ForeignKeyConstraintError`](/api/classes/ForeignKeyConstraintError), [`ExclusionConstraintError`](/api/classes/ExclusionConstraintError), [`TimeoutError`](/api/classes/TimeoutError)
- [`ConnectionError`](/api/classes/ConnectionError), [`EmptyResultError`](/api/classes/EmptyResultError), [`OptimisticLockError`](/api/classes/OptimisticLockError)
