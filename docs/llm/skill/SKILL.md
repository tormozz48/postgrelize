---
name: postgrelize
description: Use when writing, reviewing or migrating TypeScript/JavaScript code that uses postgrelize or Sequelize v6 on PostgreSQL — models, queries, associations, transactions, upserts (ON CONFLICT, MERGE), COPY, LISTEN/NOTIFY, sync and migrations, error handling, or moving a Sequelize v6 project to postgrelize.
---

# postgrelize

PostgreSQL-only ORM with the **Sequelize v6 public API** (drop-in) plus PostgreSQL features (`onConflict`, `Model.insert`, `merge`, CTEs, `copyFrom`/`copyTo`, `listen`/`notify`, advisory locks, `returningOld`). Sequelize v6 knowledge applies; PostgreSQL extras are additive options and methods.

Install: `npm install postgrelize pg`; import path `from 'postgrelize'` (`@tormozz48/postgrelize` is the deprecated former name). Node 20+, PostgreSQL 16–18, `pg` peer dependency.

## How to use this skill

1. Read the reference file for the task (progressive disclosure, load only what you need):
   - `reference/querying.md` — finders, where/operators, pagination, aggregates, raw queries
   - `reference/writing.md` — create/update/destroy, hooks, validation, upserts, bulk writes, RETURNING
   - `reference/schema.md` — define models (init / define / decorators), data types, sync, QueryInterface migrations
   - `reference/associations.md` — hasMany/belongsTo/belongsToMany, include, accessors
   - `reference/transactions-and-sessions.md` — transactions, CLS, locks, LISTEN/NOTIFY, advisory locks
   - `reference/errors.md` — error classes and how to catch them
   - `reference/security.md` — what is bound, quoted, allowlisted or raw
   - `reference/migrating-from-sequelize.md` — moving a v6 project, differences, unsupported features
   - `reference/postgresql-features.md` — MERGE, COPY, CTE, windows, subqueries, what is not supported
2. Types are authoritative: read `node_modules/postgrelize/dist/*.d.ts` (TSDoc on every public item) before guessing an option. Compact guide: `node_modules/postgrelize/llm/USAGE.md`. Full docs: <https://tormozz48.github.io/postgrelize/llms-full.txt>.
3. **Verify by running.** Execute the code against a real PostgreSQL (`docker run -e POSTGRES_PASSWORD=pw -p 5432:5432 postgres:17`) and read the output or the thrown error. Enable SQL logging with `new Sequelize(url, { logging: console.log })` to see the generated SQL. Run `tsc --noEmit` — option objects are strictly typed.

## Checklists

**New model**
- [ ] Pick a style: class + `init` (typed with `InferAttributes`), `sequelize.define`, or decorators + `sequelize.addModels`.
- [ ] Set `tableName`, `timestamps`, `paranoid` explicitly when the table already exists.
- [ ] `BIGINT` and `DECIMAL` come back as strings.
- [ ] Create tables with `sync()` only in tests/prototypes; production uses `QueryInterface` migrations.

**New query**
- [ ] Values go in `where` / `replacements` / `bind`, never in SQL strings.
- [ ] Inside a transaction, pass `{ transaction }` on every call (or enable CLS).
- [ ] Prefer `include` over manual joins; add `required: true` for inner joins.
- [ ] Large result sets: `findEach` (cursor) or `copyTo`.

**Write path**
- [ ] Insert-or-update: `upsert` (v6 shape `[instance, null]`) or `onConflict` for a real inserted flag and expressions.
- [ ] Bulk: `bulkCreate`, `insertFrom`, `merge`, `copyFrom` for very large imports.
- [ ] Catch `UniqueConstraintError` / `ValidationError` / `DatabaseError`.

**Migrating a Sequelize v6 project**
- [ ] Replace the import, remove other dialect packages, keep `pg`.
- [ ] Read `reference/migrating-from-sequelize.md` for the differences and unsupported features.
- [ ] Run the existing tests; fix what the list of intentional differences explains.

## Top mistakes

1. Missing `{ transaction }` on a query inside a transaction.
2. Expecting `upsert` to tell insert from update (it returns `[instance, null]`; use `onConflict`).
3. Building SQL with string concatenation; `literal()` and raw query text are not escaped.
4. Using `sync()` in production, or `Sequelize.useCLS()` per instance (it is process-wide).
5. Using v7 APIs or other dialects: not supported.
