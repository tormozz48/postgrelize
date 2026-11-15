# Security

postgrelize builds SQL so that data from your users cannot change the meaning of a statement. This page lists every input that reaches SQL, how it is protected, and the few APIs that take raw SQL by design.

To report a vulnerability, see [SECURITY.md](https://github.com/tormozz48/postgrelize/blob/main/SECURITY.md).

## How inputs are protected

| Mechanism         | Meaning                                                                                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bound**         | Sent to PostgreSQL as a `$n` parameter, never as SQL text                                                                                                  |
| **Identifier**    | Quoted as an identifier (`"` doubled): the value can only name a table, column, alias, channel, …                                                          |
| **Allowlist**     | Checked against a fixed set or a strict pattern; anything else throws before SQL is built                                                                  |
| **Literal**       | Escaped string literal (`''`, `E'…'` with doubled backslashes; NUL bytes rejected). Only in DDL and `COPY TO`, where PostgreSQL does not accept parameters |
| **Raw by design** | SQL you write yourself. Not escaped. Never build it from user input                                                                                        |

| Input                                                                                                                                                                                                                                                                                                                                                                                                                | Protection                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `where` values, `Op.*` values, `in` lists, JSON values, `limit` / `offset`, `increment` amounts, values of `create` / `update` / `upsert` / `bulkCreate` / `insert` / `merge`                                                                                                                                                                                                                                        | Bound                             |
| `sequelize.query` `replacements` (`:name`, `?`) and `bind` (`$1`, `$name`)                                                                                                                                                                                                                                                                                                                                           | Bound                             |
| JSON paths in `where` keys (`'meta.a.b'`, nested objects)                                                                                                                                                                                                                                                                                                                                                            | Bound                             |
| Attribute and column names, `where` keys, `order` / `group` targets, aliases, `as`, table and schema names, CTE names, index and constraint names, `LISTEN` / `NOTIFY` channels, `lock.of`                                                                                                                                                                                                                           | Identifier                        |
| `HSTORE` keys and values (serialized to one bound hstore text parameter), values of `LTREE`, `MONEY`, `XML`, `BIT`, `TSQUERY`, `MACADDR8`, `TIMESTAMP` columns                                                                                                                                                                                                                                                       | Bound                             |
| `NOTIFY` payloads, advisory-lock keys, transaction `settings`                                                                                                                                                                                                                                                                                                                                                        | Bound                             |
| `order` directions, `Op` operators, `where(col, comparator, value)` comparators, `fn()` names, `Model.aggregate` function names, `cast()` and `'attr::type'` types, `lock` strengths, isolation levels, `onDelete` / `onUpdate`, index `using` / operator classes, `Deferrable`, DataTypes parameters (`STRING(n)`, `DECIMAL(p, s)`, `BIT(n)`, `VARBIT(n)`, `TIMESTAMP(p)`, …), `timezone`, `COPY TO` format options | Allowlist                         |
| DDL defaults (an `HSTORE` default object is serialized, then escaped), table and column comments, `ENUM` values, partial-index and `CHECK` conditions, `COPY TO` filters                                                                                                                                                                                                                                             | Literal                           |
| `COPY FROM` data                                                                                                                                                                                                                                                                                                                                                                                                     | Escaped in the `COPY` text format |
| `literal()`, the SQL text of `sequelize.query`, string `where` / `order`                                                                                                                                                                                                                                                                                                                                             | **Raw by design**                 |

The `statementCache` option sends no user data to PostgreSQL as a name: a prepared statement is named `pgz_` plus a hash of the SQL text, and its `max` must be a positive integer. Values stay bound parameters.

## Safe patterns

User values in model queries are always bound:

<<< @/examples/security.ts#values{ts}

In raw SQL, pass user values through `replacements` or `bind`:

<<< @/examples/security.ts#raw-query{ts}

Column names chosen by users (sorting, filtering by a field) are quoted, so they cannot inject SQL. But they can still name any column of the table. Map them through your own allowlist:

<<< @/examples/security.ts#identifiers{ts}

`literal()` inserts its text unchanged. Use it only for constant SQL written by you:

<<< @/examples/security.ts#literal{ts}

## Not injection, but worth knowing

- **Filtering on any column.** Passing a request object straight in as `where` lets callers filter on any column, including ones you never show. Build `where` from the fields you allow.
- **Mass assignment.** `Model.update(values)` and `create(values)` write every attribute present in `values`. Pass `fields` or pick the allowed attributes first.
- **LIKE patterns.** `Op.like`, `Op.startsWith`, `Op.substring` and `Op.endsWith` keep LIKE semantics, as in Sequelize v6: `%`, `_` and `\` in the value act as wildcards. Escape them when users should match literally.

## How this is verified

- Every input above has tests on a real PostgreSQL in `tests/integration/security/`. The tests use a payload corpus: quote breakouts, backslash and `E''` tricks, dollar quoting, `U&` escapes, comments, stacked statements, very long strings. They also run property-based tests with random strings, checking that values read back byte-for-byte and identifiers name exactly what was given. A canary table proves that no injected statement ran.
- CodeQL (`security-extended` queries) scans every pull request.
- Every input that reaches SQL must have a protection and tests before it is merged ([ADR-020](https://github.com/tormozz48/postgrelize/blob/main/.10x/adrs/020-injection-assurance.md)).
