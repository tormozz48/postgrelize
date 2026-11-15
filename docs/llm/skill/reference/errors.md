# Errors

<<< @/examples/llm-usage.ts#errors{ts}

| Class | When |
| --- | --- |
| `ValidationError` (`.errors[]`) | validators, `allowNull`, schema validation |
| `UniqueConstraintError`, `ForeignKeyConstraintError`, `ExclusionConstraintError` | constraint violation |
| `DatabaseError` (`.parent` holds the `pg` error with `code`, `detail`, `constraint`) | any other server error |
| `TimeoutError` | cancelled statement (SQLSTATE 57014) |
| `OptimisticLockError` | stale `version` on save |
| `EmptyResultError` | `rejectOnEmpty` found nothing |
| `ConnectionError` and subclasses | cannot connect or authenticate |

<<< @/examples/hooks-validation.ts#errors{ts}
