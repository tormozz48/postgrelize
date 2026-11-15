# ADR-024: SQL AST extension for set operations, FROM sources and CTE forms

**Status:** Accepted · **Date:** 2026-11-15 · **Feature:** backlog 4 / S12 · **Author:** 10x-Team (Architect + Security)

## Context
S12 adds `UNION` / `INTERSECT` / `EXCEPT`, `LATERAL`, `VALUES` and set-returning functions in FROM (with `WITH ORDINALITY`), `JSON_TABLE` (PostgreSQL 17), `TABLESAMPLE`, `FETCH FIRST … WITH TIES`, data-modifying CTEs and CTE `SEARCH` / `CYCLE`. The AST of ADR-013 knows only `SelectNode`, a recursive-CTE-only `UnionNode` and `FROM` items that are tables or aliased `SelectNode`s. Each feature needs a new node shape; we need one consistent extension instead of seven ad-hoc ones.

## Decision
1. **`QueryNode = SelectNode | SetOperationNode`.** `SetOperationNode { kind: 'setop'; op: 'UNION' | 'INTERSECT' | 'EXCEPT'; all; left; right }` replaces `UnionNode` (recursive CTEs use `op: 'UNION'`). Everywhere a subquery fits (`FROM`, `JOIN`, `IN`, scalar, CTE body) the type becomes `QueryNode`. An operand is wrapped in parentheses only when it is a set operation or carries `ORDER BY` / `LIMIT` / `OFFSET` / `FETCH` / a lock / `WITH`. `ORDER BY` and `LIMIT` over a combined result are applied by the finder that reads it through `source`, never by the set-operation node.
2. **`FromItem` is a discriminated union**: `TableRef` (gains `sample`), `subquery` (gains `lateral`), `values`, `function` (name, args, column aliases, ordinality alias), `jsonTable`. `QueryCompiler.from` switches exhaustively with a `never` check. `ModifyingNode = InsertNode | UpdateNode | DeleteNode` joins `CteNode.query` (`QueryNode | ModifyingNode`); a CTE gains `search` and `cycle` descriptors.
3. **`FETCH FIRST n ROWS WITH TIES`** is a `SelectNode.withTies` flag; the count stays a bound parameter.
4. **Public API is options and `Subquery` methods**, no new fluent builder: `Subquery#union/intersect/except`, `source` accepting a relation name, `Subquery` or a source option, `from` entries accepting source options (`values`, `function`, `jsonTable`, `lateral`, `model` + `sample`), find options `sample` and `withTies`, `with.<name>.search/cycle`, `Model.updateStatement/deleteStatement/insertStatement` for modifying CTEs, include option `lateral` for top-N per parent.
5. **Input protection (ADR-002, ADR-010, ADR-020):** all values (VALUES cells, function args, sample percent and seed, fetch count) are bound; every name (function, column, alias, CTE, `SEARCH` / `CYCLE` columns) is a quoted identifier; set-operation keywords, sampling methods, search modes, JSON_TABLE column kinds and column type names go through allowlists; JSON paths are bound unless PostgreSQL rejects parameters there (then escaped through the DDL literal path with a NUL check).
6. Modifying CTEs run on the writer: a find with a data-modifying CTE never routes to a replica.

## Alternatives Considered
| Alternative | Pros | Cons | Why Not |
|---|---|---|---|
| Fluent `union()` / `lateral()` query builder | Reads like SQL | Second API style next to v6 options (see ADR-011) | Inconsistent with options-based API |
| Keep `UnionNode`, add `IntersectNode`, `ExceptNode` | No rename | Three shapes with the same fields, three compiler cases | Duplication |
| Free-text `from: literal('LATERAL …')` | No new nodes | Raw SQL, no binding or typing | Against ADR-002; already possible today |
| `ORDER BY` / `LIMIT` on `SetOperationNode` | Direct SQL form | Order targets need output-column resolution; duplicates finder logic | YAGNI; `source: subquery` covers it |

## Consequences
+ One extension point per concept; exhaustive switches catch missing cases. + Existing SQL text is unchanged for existing queries (no new parentheses). − `SubqueryNode.query` and join/from subqueries widen to `QueryNode`; consumers that assumed `SelectNode` get a type error to fix. − JSON_TABLE needs PostgreSQL 17; the feature is rejected earlier with a clear error on older servers.
