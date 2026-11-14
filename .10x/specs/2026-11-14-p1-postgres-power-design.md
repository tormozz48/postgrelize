# P1 — PostgreSQL power features — Design Spec

**Date:** 2026-11-14 · **Status:** Accepted (autonomous mode) · **Feature:** `postgres-power` · ADR-011, ADR-012

All features are additive extensions (ADR-001): new options, builders and methods; Sequelize v6 behaviour is unchanged. Each cycle ships as its own PR with integration tests (no v6 oracle exists) plus differential regression of the v6 surface.

## P1-A Query power
| Feature | API |
|---|---|
| Subqueries | `Model.subquery(findOptions)` → expression usable in `where` (`{ id: { [Op.in]: Post.subquery({ attributes: ['userId'], where }) } }`), in `attributes` (`[Post.subquery({...}), 'postCount']`) and as a source in P1-B. Correlated references via `col('User.id')`. |
| EXISTS | `exists(subquery)` / `notExists(subquery)` builders, usable as `where` conditions. |
| DISTINCT ON | `findAll({ distinctOn: ['userId'], order: [['userId'], ['createdAt', 'DESC']] })` |
| Window functions | `over(fn('row_number'), { partitionBy: ['userId'], orderBy: [['createdAt', 'DESC']] })` in `attributes`, `order`. |
| Row comparison | `tuple(col('createdAt'), col('id'))` with `where(tuple(...), Op.lt, tuple(date, id))` (keyset pagination). |

## P1-B Write power
| Feature | API |
|---|---|
| UPDATE ... FROM | `Model.update(values, { where, from: { alias: Model or subquery } })`; `col('alias.attr')` in values/where. |
| DELETE ... USING | `Model.destroy({ where, using: { alias: Model or subquery } })` |
| INSERT ... SELECT | `Model.insertFrom(subquery, { columns, onConflict, returning })` |
| MERGE (PG15+, RETURNING PG17+) | `Model.merge({ source: rows[] or subquery, as, on, whenMatched, whenNotMatched, whenNotMatchedBySource, returning })` |

## P1-C Connection power
| Feature | API |
|---|---|
| Cursors / streaming | `Model.findEach(options, { batchSize })` async iterator (server-side cursor inside a transaction) |
| LISTEN / NOTIFY | `sequelize.listen(channel, handler) → unlisten()`, `sequelize.notify(channel, payload)` |
| SET LOCAL / RLS | `sequelize.transaction({ settings: { 'app.user_id': '42', statement_timeout: '5s' } }, fn)` |
| Advisory locks | `transaction.advisoryLock(key)` (xact), `sequelize.withAdvisoryLock(key, fn)`, `tryAdvisoryLock` |
| COPY | `Model.copyFrom(rows | AsyncIterable, { columns })` via `COPY ... FROM STDIN` (text format, built-in, no extra dependency); `Model.copyTo(options)` async iterable of rows |

## P1-D Schema power
| Feature | API |
|---|---|
| Identity columns | attribute `autoIncrement: true` + model/attribute `identity: 'always' | 'byDefault'` → `GENERATED ... AS IDENTITY` |
| Generated columns | attribute `generated: { as: literal | fn, stored?: boolean }` → `GENERATED ALWAYS AS (...) STORED/VIRTUAL`; never written by INSERT/UPDATE |
| INTERVAL | `DataTypes.INTERVAL` (string values) |
| OVERRIDING | `create/bulkCreate/insert({ overriding: 'system' | 'user' })` |
| Enum alter | `sync({ alter })` adds missing enum values (`ALTER TYPE ... ADD VALUE IF NOT EXISTS`) |

## Non-goals
`RETURNING old/new` (PG18-only; revisit when 18 is the minimum), partitioning, JSON_TABLE, read replicas (separate compat item).
