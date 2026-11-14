# Backlog — CTE and COPY TO — Design Spec

**Date:** 2026-11-14 · **Status:** Accepted (autonomous mode) · **Feature:** `postgres-power` · ADR-013

## CTE (`WITH`)
Options of `findAll` / `findOne` / `count` / `Model.subquery`:

| Option | Meaning |
|---|---|
| `with: { name: Subquery | CteDefinition }` | Common table expressions. `CteDefinition = { query, recursive?, unionAll? = true, materialized? }`; `recursive` (a subquery) makes it `WITH RECURSIVE name AS (query UNION [ALL] recursive)`. |
| `source: 'name'` | Read the model rows from a CTE (or another relation) instead of the model table: `FROM "name" AS "Model"`. |
| `from: { alias: Model | Subquery | 'cteName' }` | Extra relations joined by `where` (`FROM "Model", "alias"`), used by recursive steps: `where: { parentId: col('tree.id') }`. |

```ts
const tree = Category.subquery({ where: { parentId: null } });
const children = Category.subquery({ where: { parentId: col('tree.id') }, from: { tree: 'tree' } });
await Category.findAll({ with: { tree: { query: tree, recursive: children } }, source: 'tree' });
```

## COPY TO
`Model.copyTo(findOptions & { format?: 'text' | 'csv' | 'binary', header?, delimiter?, nullString?, quote? })` → `AsyncIterable<Buffer>` of `COPY (SELECT ...) TO STDOUT WITH (...)` output. Default scope / paranoid apply. Streams with backpressure (the socket is paused while the consumer is slow). Stopping iteration early drains the rest in the background before the client is released.

## Non-goals
Data-modifying CTEs (`WITH x AS (UPDATE ...)`), `SEARCH` / `CYCLE` clauses, parsing COPY output into instances (use `findEach`).
