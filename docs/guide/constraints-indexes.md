# Constraints and indexes

`addIndex` and `addConstraint` cover the Sequelize v6 shapes (see [Schema](/guide/schema)). This page lists the PostgreSQL additions. They are new options: existing option shapes and defaults do not change.

## Expression indexes

<<< @/examples/constraints-indexes.ts#expression-index{ts}

- An index field is a column (`'email'`, `{ name: 'email' }`) or an expression (`{ expression: 'lower(email)' }`). Every field accepts `order`, `nulls` (`'FIRST'` / `'LAST'`), `collate` (a quoted collation name) and `operator` (operator class); `include` adds covering columns.
- **The `expression` is SQL you write.** It is wrapped in parentheses and is not escaped: never build it from user input. See [Security](/security).
- A name cannot be derived from an expression, so an index with an expression field needs an explicit `name`.
- Model `indexes` accept the same fields. An expression must be immutable (PostgreSQL rejects `date_trunc` on `timestamptz`, for example).
