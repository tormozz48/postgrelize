# Security

- Values are always bound (`$1..$n`): `where`, `create`/`update`/`upsert`/`insert`/`merge`, `replacements`, `bind`, `NOTIFY` payloads, advisory keys, transaction `settings`.
- Identifiers (columns, tables, aliases, schemas, channels) are quoted; operators, function names, cast types, lock strengths, isolation levels and order directions are allowlisted and throw otherwise.
- `literal()`, raw `sequelize.query` text and string `where` are raw by design: only constants you wrote.

<<< @/examples/security.ts#values{ts}

<<< @/examples/security.ts#raw-query{ts}

<<< @/examples/security.ts#identifiers{ts}

<<< @/examples/security.ts#literal{ts}

Full table: <https://tormozz48.github.io/postgrelize/security>.
