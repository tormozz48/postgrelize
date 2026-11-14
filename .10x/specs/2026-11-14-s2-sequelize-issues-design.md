# S2 — Sequelize PostgreSQL issues: parity regressions and inherited bugs

**Date:** 2026-11-14 · Roadmap: `2026-11-14-backlog-2-roadmap-design.md` · Review: `.10x/reviews/2026-11-14-sequelize-issues.md` · ADR-016

## Findings (73 open v6+PG issues)
FIXED 43 · INHERITED 14 · REGRESSION 8 (7 root causes) · NOT-APPLICABLE 7 · UNKNOWN 1.
Extra finding: included associations are not instance properties (`todo.User` undefined) — v6 parity gap missed by the
differential suite because it compares `toJSON()`.

## S2a — parity regressions (postgrelize worse than v6) — PR 1
Fix to match v6; each gets a differential test.
| Item | Fix |
|---|---|
| Association properties | define `instance[as]` getters/setters for every association alias (like attribute accessors) |
| #13734 | `upsert` / `bulkCreate({updateOnDuplicate})` conflict target considers unique `indexes` (v6 rules) |
| #10419 | user-declared `createdAt`/`updatedAt` attributes (custom `field`) keep their definition |
| #17486 | `upsert` keeps an explicitly supplied `updatedAt` |
| #15466 / #11100 | `ARRAY(ENUM)` parsed into JS arrays |
| #15522 | `sync()` with FK cycles: create tables first, add cyclic FKs after |
| #17118 | `addColumn` emits `COMMENT ON COLUMN` |
| #9040 | `order: ['jsonCol.path']` orders by the JSON path (v6: `#>>` text) |
| differential suite | compare instance properties of includes, not only `toJSON()` |

## S2b — inherited v6 bugs, fixed by default (ADR-016) — PR 2
Each gets a regression test; the differential suite keeps the v6 comparison out of these cases and the
divergence is listed on the public "fixed issues" page.
| Item | Fix |
|---|---|
| #18617 | JSON path keys with `,` `\` `"` escaped (path passed as array param) |
| #5173 | jsonb operators (`Op.contains` …) on nested paths use `#>` (jsonb), not `#>>` |
| #16043 | `{ [Op.any]: [...] }` shorthand → `= ANY($1)` |
| #18423 | `sync({ schema })` honoured (tables created / dropped in that schema) |
| #13167 | `sync({ alter })` keeps sequence default of non-PK `autoIncrement` columns |
| #16787 | `describeTable` default values: unquote/unescape literals, strip casts, keep numbers/functions faithfully |
| #18256 | belongsToMany + custom `sourceKey` + `limit`: source key projected into the subquery |
| #12971 / #11146 | top-level `$assoc.col$` with hasMany include + `limit`: required columns available (subquery decision) |
| #14497 | `upsert({ overriding })` forwarded |
| #12595 | `upsert` on partial unique index: target with index `where` |
| extra | `bulkCreate({ ignoreDuplicates })` maps returned rows to the right instances |

## Not fixed (documented)
#16929 (v6 API shape; `onConflict` workaround), #11968 (design change: upsert un-deleting paranoid rows),
#11288 (feature request), #12948 (unknown), NOT-APPLICABLE items (unsupported v6 options: will be rejected/warned in a later item).

## Public page
`docs/sequelize-issues.md`: fixed issues (FIXED + S2b), parity fixes, known non-fixed; moved into the VitePress site in S3.
