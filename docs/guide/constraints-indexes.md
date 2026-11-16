# Constraints and indexes

`addIndex` and `addConstraint` cover the Sequelize v6 shapes (see [Schema](/guide/schema)). This page lists the PostgreSQL additions. They are new options: existing option shapes and defaults do not change.

## Expression indexes

<<< @/examples/constraints-indexes.ts#expression-index{ts}

- An index field is a column (`'email'`, `{ name: 'email' }`) or an expression (`{ expression: 'lower(email)' }`). Every field accepts `order`, `nulls` (`'FIRST'` / `'LAST'`), `collate` (a quoted collation name) and `operator` (operator class); `include` adds covering columns.
- **The `expression` is SQL you write.** It is wrapped in parentheses and is not escaped: never build it from user input. See [Security](/security).
- A name cannot be derived from an expression, so an index with an expression field needs an explicit `name`.
- Model `indexes` accept the same fields. An expression must be immutable (PostgreSQL rejects `date_trunc` on `timestamptz`, for example).

## EXCLUDE constraints

<<< @/examples/constraints-indexes.ts#exclude{ts}

- `addConstraint(table, { type: 'exclude', exclude: [{ name | expression, with }], using, where, include, deferrable })`. Each element is a column or an expression with the operator it is compared with (`with`), and accepts `collate`, `operator` (operator class), `order` and `nulls`.
- Scalar columns with `=` in a `gist` / `spgist` exclusion need the `btree_gist` extension (`createExtension('btree_gist')`).
- The operator is checked against a pattern of operator characters (`=`, `&&`, `-|-`, `<->`); a name or expression cannot be smuggled in. Expressions are trusted SQL (see above). `where` is a where-object compiled like a partial-index condition; `deferrable` takes a `Deferrable` constant.
- Without `name` the constraint is called `<table>_<columns>_excl`; with an expression element give a `name`.
- A violation raises `ExclusionConstraintError`.

## NOT VALID and VALIDATE CONSTRAINT

<<< @/examples/constraints-indexes.ts#not-valid{ts}

`notValid: true` (check and foreign key constraints) adds the constraint without scanning existing rows, so it takes only a short lock; new and updated rows are checked at once. After cleaning the old rows, `validateConstraint(table, name)` scans the table without blocking writes. Using `notValid` with another constraint type throws.

## PostgreSQL 18 constraints

<<< @/examples/constraints-indexes-pg18.ts#temporal{ts}

<<< @/examples/constraints-indexes-pg18.ts#not-enforced{ts}

These options render PostgreSQL 18 syntax. Older servers reject the statement with their own syntax error; nothing is sent differently by version.

- `withoutOverlaps: true` (unique and primary key): the last field is a range or multirange column and no two rows with equal other fields may overlap. Scalar columns in a temporal key need the `btree_gist` extension.
- `period: true` (foreign key): the last field and the last referenced field are `PERIOD` columns; the referenced table needs a `withoutOverlaps` key. List the referenced columns with `references.fields` (`references.field` stays the single-column form).
- `enforced: false` (check and foreign key): `NOT ENFORCED` records the constraint without checking it, so it documents a rule or helps the planner. It can be combined with `notValid`.
