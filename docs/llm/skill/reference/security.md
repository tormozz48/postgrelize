# Security

- Values are bound (`$1..$n`): `where`, `create`/`update`/`upsert`/`insert`/`merge`, finder `replacements`, `bind`, `NOTIFY` payloads, advisory keys, transaction `settings`. `sequelize.query` `replacements` are escaped into the SQL text like v6 (`SqlLiteral`), so only they, never the SQL text, take user values.
- Identifiers (columns, tables, aliases, schemas, channels) are quoted; operators, function names, cast types, lock strengths, isolation levels and order directions are allowlisted and throw otherwise.
- `literal()`, raw `sequelize.query` text and string `where` are raw by design: only constants you wrote.

<<< @/examples/security.ts#values{ts}

<<< @/examples/security.ts#raw-query{ts}

<<< @/examples/security.ts#identifiers{ts}

<<< @/examples/security.ts#literal{ts}

Full table: <https://tormozz48.github.io/postgrelize/security>.
