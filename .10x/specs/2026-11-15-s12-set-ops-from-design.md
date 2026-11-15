# S12 — Set operations and FROM sources (design)

Backlog 4, stage S12. Decision record: [ADR-024](../adrs/024-sql-ast-set-ops-from-sources.md). Rows: `planned` → `supported` in `docs/coverage/postgresql-features.ts`.

## Delivery (one topic per PR)
1. **PR A — set operations and `WITH TIES`**: ADR/spec, `QueryNode`, `Subquery#union/intersect/except`, `source: Subquery`, `withTies`.
2. **PR B — FROM sources**: `values`, `function` (+ ordinality), `jsonTable` (PG17), `lateral`, `sample` (TABLESAMPLE), include `lateral` top-N per parent.
3. **PR C — CTE extras**: data-modifying CTEs (`Model.updateStatement/deleteStatement/insertStatement`), `search` / `cycle`.

## Public API
```ts
// set operations: a Subquery combines with another one; result is a Subquery
const ids = Post.subquery({ attributes: ['userId'], where: { published: true } })
  .union(Comment.subquery({ attributes: ['userId'] }))      // UNION; { all: true } for UNION ALL
  .except(Ban.subquery({ attributes: ['userId'] }));
await User.findAll({ where: { id: { [Op.in]: ids } } });
await User.findAll({ source: a.union(b), order: [['name', 'ASC']], limit: 10 }); // FROM (… UNION …) AS "User"

await Post.findAll({ order: [['score', 'DESC']], limit: 3, withTies: true });   // FETCH FIRST $1 ROWS WITH TIES

await User.findAll({ from: { v: { values: { columns: ['id', 'n'], rows: [[1, 'a']] } } }, where: { id: col('v.id') } });
await User.findAll({ from: { g: { function: 'generate_series', args: [cast(1,'int'), cast(3,'int')], columns: ['n'], ordinality: 'ord' } } });
await User.findAll({ from: { p: { lateral: Post.subquery({ where: { userId: col('User.id') }, limit: 3 }) } } });
await User.findAll({ include: [{ association: 'posts', separate: true, limit: 3, order: [['id','DESC']], lateral: true }] });
await Post.findAll({ sample: { method: 'BERNOULLI', percent: 10, seed: 42 } });
await Post.findAll({ source: { jsonTable: { … } } });  // PG17
await Post.findAll({ with: { moved: { query: Task.deleteStatement({ where: { done: true }, returning: true }) } }, source: 'moved' });
await Node.findAll({ with: { t: { query, recursive, search: { by: ['id'], mode: 'depth', set: 'ord' }, cycle: { columns: ['id'], set: 'loop', using: 'path' } } }, source: 't' });
```
Source options (`values`, `function`, `jsonTable`, `lateral`, `model` + `sample`) are accepted by `from` entries. `source` stays a relation name or a `Subquery`. Lateral includes: `separate` + `limit` + `lateral: true`; the child query is `unnest(keys) JOIN LATERAL (per-parent select) ON TRUE` (internal `lateralKeys`).

## Rules
- Values bound; names quoted; keywords through allowlists (see ADR-024 §5).
- Function-call arguments are bound as untyped parameters. PostgreSQL cannot always infer their type (`generate_series($1, $2)`): wrap them in `cast(value, 'integer')`; documented.
- `withTies` needs `limit` and `order` (PostgreSQL rejects it otherwise; the error surfaces as a `DatabaseError`).
- `sample` percent must be a finite number in [0, 100]; seed an integer; method one of `BERNOULLI`, `SYSTEM`. Applies to the model table only.
- Set-operation operands must expose the same column list; PostgreSQL validates it.
- Data-modifying CTEs force the writer connection (`finds.route`). They are supported only in `findAll` / `count` style reads (top-level `SELECT`). `cycle.using` is required: PostgreSQL 16 and 17 do not accept `CYCLE` without `USING`.
- `jsonTable` needs PostgreSQL 17; older servers reject the statement (no client-side version check). Paths are rendered as escaped literals (PostgreSQL accepts only constants there); column types go through the cast-type allowlist.

## Tests
Unit (`tests/unit/sql`): compilation of every new node and the parenthesis rules. Integration (`tests/integration/set-ops-from.test.ts`, PG17 cases gated through `minimumServerVersion`): each option on real PostgreSQL. Security (`tests/integration/security/`): payloads on every new input. No differential tests: Sequelize v6 has none of these features.

## Docs
Guide page `docs/guide/advanced-queries.md` + regions in `docs/examples/advanced-queries.ts`; security table rows; matrix rows; README list; `llm` cheat sheet when affected.
