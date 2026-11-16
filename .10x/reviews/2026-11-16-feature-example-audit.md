# Feature example audit (2026-11-16)

Owner requirement: every feature beyond Sequelize v6 has (1) a complete example, (2) a guide section that describes it and includes the example, (3) CI that runs the example. Design: [spec](../specs/2026-11-16-feature-examples-design.md).

## Result

- Matrix: 133 rows, 109 `supported`. 71 are beyond v6, 38 have a v6 equivalent (no example required).
- Extras outside the matrix: 3.
- Features audited: 74. With example and guide before this work: 71. Missing: 3 (ORDER BY … NULLS FIRST / LAST; INSERT … OVERRIDING SYSTEM / USER VALUE; = ANY($1) for long IN lists).
- Existing example coverage was already broad: the `docs` project runs every `docs/examples/*.ts`. Weak spots found: `minimumServerVersion` skips passed silently (now reported as skipped); no check linked a feature to its example or guide.
- Rows with other statuses (`literal`, `planned`, `out-of-scope`) are not features yet and are not audited. S13 (partitioning, PG18 constraints) and S15 (PostGIS) rows join once merged.

## Beyond v6 (71)

| Feature | Example | Guide | Test |
| --- | --- | --- | --- |
| DISTINCT ON | `advanced-queries.ts#distinct-on` | `advanced-queries#distinct-on` | `integration/query-power.test.ts` |
| Window functions (OVER, PARTITION BY) | `advanced-queries.ts#window` | `advanced-queries#window-functions` | `integration/query-power.test.ts` |
| CTEs and WITH RECURSIVE | `advanced-queries.ts#recursive-cte` | `advanced-queries#common-table-expressions` | `integration/cte-copy-to.test.ts` |
| CTE MATERIALIZED / NOT MATERIALIZED | `advanced-queries.ts#cte` | `advanced-queries#common-table-expressions` | `integration/cte-copy-to.test.ts` |
| Data-modifying CTEs (WITH … UPDATE/DELETE … RETURNING) | `advanced-queries.ts#data-modifying-cte` | `advanced-queries#data-modifying-ctes` | `integration/cte-extras.test.ts` |
| CTE SEARCH / CYCLE clauses | `advanced-queries.ts#cte-search` | `advanced-queries#search-and-cycle` | `integration/cte-extras.test.ts` |
| LATERAL joins | `advanced-queries.ts#lateral` | `advanced-queries#lateral-joins-and-top-n-per-parent` | `integration/set-ops-from.test.ts` |
| ORDER BY … NULLS FIRST / LAST | **missing** | **missing** | `integration/pg-coverage.test.ts` |
| TABLESAMPLE | `advanced-queries.ts#tablesample` | `advanced-queries#tablesample` | `integration/set-ops-from.test.ts` |
| FETCH FIRST … WITH TIES | `advanced-queries.ts#with-ties` | `advanced-queries#fetch-first-with-ties` | `integration/set-ops-from.test.ts` |
| UNION / INTERSECT / EXCEPT [ALL] | `advanced-queries.ts#set-operations` | `advanced-queries#set-operations` | `integration/set-ops-from.test.ts` |
| Subqueries (IN, scalar, EXISTS / NOT EXISTS, correlated) | `advanced-queries.ts#subquery` | `advanced-queries#subqueries` | `integration/query-power.test.ts` |
| Row-value comparison (keyset pagination) | `advanced-queries.ts#keyset` | `advanced-queries#row-comparison-and-keyset-pagination` | `integration/query-power.test.ts` |
| Standalone VALUES lists and set-returning functions in FROM (unnest, generate_series, WITH ORDINALITY) | `advanced-queries.ts#from-sources` | `advanced-queries#values-set-returning-functions-and-json-table` | `integration/set-ops-from.test.ts` |
| INSERT … ON CONFLICT DO NOTHING | `upserts.ts#targets` | `upserts#onconflict` | `integration/on-conflict.test.ts` |
| ON CONFLICT DO UPDATE with expressions and inserted/updated flag | `upserts.ts#increment` | `upserts#expression-updates-and-wasinserted` | `integration/on-conflict.test.ts` |
| ON CONFLICT DO UPDATE … WHERE | `upserts.ts#conditional` | `upserts#conditional-updates` | `integration/on-conflict.test.ts` |
| ON CONFLICT ON CONSTRAINT, expression and partial-index targets | `upserts.ts#targets` | `upserts#conflict-targets` | `integration/on-conflict.test.ts` |
| INSERT … OVERRIDING SYSTEM / USER VALUE | **missing** | **missing** | `integration/sequelize-issues.test.ts` |
| INSERT … SELECT | `bulk-writes.ts#insert-from` | `bulk-writes#insert-select` | `integration/write-power.test.ts` |
| UPDATE … FROM and DELETE … USING | `bulk-writes.ts#update-from` | `bulk-writes#update-from` | `integration/write-power.test.ts` |
| MERGE (WHEN MATCHED / NOT MATCHED, DELETE, DO NOTHING) | `bulk-writes.ts#merge` | `bulk-writes#merge` | `integration/write-power.test.ts` |
| MERGE … RETURNING merge_action() and WHEN NOT MATCHED BY SOURCE | `merge-returning.ts#merge-returning` | `bulk-writes#returning-and-not-matched-by-source-postgresql-17` | `integration/write-power.test.ts` |
| RETURNING OLD (pre-statement values) | `returning-old.ts#update` | `upserts#old-values-with-returningold-postgresql-18` | `integration/returning-old.test.ts` |
| COPY FROM STDIN (bulk load) | `copy.ts#copy-from` | `bulk-writes#import-with-copyfrom` | `integration/connection-power.test.ts` |
| COPY TO STDOUT (export) | `copy.ts#copy-to` | `bulk-writes#export-with-copyto` | `integration/cte-copy-to.test.ts` |
| Bulk insert via UNNEST arrays | `bulk-writes.ts#unnest` | `bulk-writes#unnest` | `integration/session-extras.test.ts` |
| IS [NOT] DISTINCT FROM | `querying.ts#where` | `querying#filtering` | `integration/postgrelize.test.ts` |
| = ANY($1) for long IN lists | **missing** | **missing** | `integration/postgrelize.test.ts` |
| SIMILAR TO | `operator-helpers.ts#similar-to` | `querying#operator-and-search-helpers` | `integration/operator-helpers.test.ts` |
| jsonpath operators (@?, @@) and jsonb_path_* functions | `operator-helpers.ts#jsonpath` | `querying#operator-and-search-helpers` | `integration/operator-helpers.test.ts` |
| JSON_TABLE | `json-table.ts#json-table` | `advanced-queries#values-set-returning-functions-and-json-table` | `integration/set-ops-from.test.ts` |
| Multirange operators and functions (range_agg, unnest) | `multirange.ts#use` | `models#multirange-types` | `integration/types-ii.test.ts` |
| Full-text search match (@@) | `operator-helpers.ts#full-text` | `querying#operator-and-search-helpers` | `integration/pg-coverage.test.ts` |
| Full-text ranking and highlighting (ts_rank, ts_headline, setweight) | `operator-helpers.ts#full-text` | `querying#operator-and-search-helpers` | `integration/operator-helpers.test.ts` |
| Network operators (<<, <<=, >>, >>=, host(), network()) | `operator-helpers.ts#network` | `querying#operator-and-search-helpers` | `integration/operator-helpers.test.ts` |
| Geometric operators and functions | `geometry.ts#use` | `models#geometric-types` | `integration/types-ii.test.ts` |
| hstore operators (->, ?, @>) | `types.ts#use` | `models#postgresql-specific-types` | `integration/types-i.test.ts` |
| pg_trgm similarity (%, similarity(), word_similarity()) | `operator-helpers.ts#trigram` | `querying#operator-and-search-helpers` | `integration/operator-helpers.test.ts` |
| timestamp without time zone | `types.ts#use` | `models#postgresql-specific-types` | `integration/types-i.test.ts` |
| interval | `models.ts#postgres-columns` | `models#identity-generated` | `integration/pg-coverage.test.ts` |
| money | `types.ts#use` | `models#postgresql-specific-types` | `integration/types-i.test.ts` |
| composite types | `composite.ts#use` | `models#composite-types` | `integration/types-ii.test.ts` |
| multirange types | `multirange.ts#use` | `models#multirange-types` | `integration/types-ii.test.ts` |
| xml | `types.ts#use` | `models#postgresql-specific-types` | `integration/types-i.test.ts` |
| bit and bit varying | `types.ts#use` | `models#postgresql-specific-types` | `integration/types-i.test.ts` |
| macaddr8 | `types.ts#use` | `models#postgresql-specific-types` | `integration/types-i.test.ts` |
| geometric types (point, line, lseg, box, path, polygon, circle) | `geometry.ts#use` | `models#geometric-types` | `integration/types-ii.test.ts` |
| tsquery | `types.ts#use` | `models#postgresql-specific-types` | `integration/types-i.test.ts` |
| ltree (extension) | `types.ts#use` | `models#postgresql-specific-types` | `integration/types-i.test.ts` |
| Stored and virtual generated columns, identity columns | `models.ts#postgres-columns` | `models#identity-generated` | `integration/schema-power.test.ts` |
| UNIQUE NULLS NOT DISTINCT | `schema.ts#sync` | `schema#sync` | `integration/schema.test.ts` |
| EXCLUDE constraints | `constraints-indexes.ts#exclude` | `constraints-indexes#exclude-constraints` | `integration/constraints-indexes.test.ts` |
| NOT VALID constraints and VALIDATE CONSTRAINT | `constraints-indexes.ts#not-valid` | `constraints-indexes#not-valid-and-validate-constraint` | `integration/constraints-indexes.test.ts` |
| Expression indexes (lower(email)) | `constraints-indexes.ts#expression-index` | `constraints-indexes#expression-indexes` | `integration/constraints-indexes.test.ts` |
| Views and materialized views | `schema-objects.ts#views` | `schema-objects#views-and-materialized-views` | `integration/ddl-objects.test.ts` |
| Sequences (CREATE SEQUENCE, setval) | `schema-objects.ts#sequence` | `schema-objects#sequences` | `integration/ddl-objects.test.ts` |
| Functions and triggers | `schema-objects.ts#function-trigger` | `schema-objects#functions-and-triggers` | `compat/functions-triggers.test.ts` |
| Extensions (CREATE EXTENSION) | `schema-objects.ts#extension` | `schema-objects#extensions` | `integration/ddl-objects.test.ts` |
| Row-level security policies | `schema-objects.ts#rls` | `schema-objects#row-level-security` | `integration/ddl-objects.test.ts` |
| UNLOGGED and TEMPORARY tables | `schema-objects.ts#persistence` | `schema-objects#unlogged-and-temporary-tables` | `integration/ddl-objects.test.ts` |
| READ ONLY transactions | `transactions.ts#read-only` | `transactions#read-only-transactions` | `integration/pg-coverage.test.ts` |
| DEFERRABLE transaction mode (SERIALIZABLE READ ONLY DEFERRABLE) | `transactions.ts#deferrable` | `transactions#deferrable-read-only-transactions` | `integration/session-extras.test.ts` |
| Advisory locks | `sessions.ts#advisory-locks` | `sessions#advisory-locks` | `integration/connection-power.test.ts` |
| LISTEN / NOTIFY | `sessions.ts#listen-notify` | `sessions#listen-notify` | `integration/connection-power.test.ts` |
| SET LOCAL settings (statement_timeout, lock_timeout, RLS variables, search_path) | `sessions.ts#settings` | `sessions#transaction-settings` | `integration/connection-power.test.ts` |
| Server-side cursors and streaming (findEach) | `advanced-queries.ts#find-each` | `advanced-queries#server-side-cursors-with-findeach` | `integration/connection-power.test.ts` |
| COPY streaming with backpressure | `copy.ts#copy-to` | `bulk-writes#export-with-copyto` | `integration/cte-copy-to.test.ts` |
| Read replicas | `sessions.ts#replication` | `sessions#read-replicas` | `integration/replication.test.ts` |
| Named prepared statements | `performance.ts#statement-cache` | `performance#prepared-statements` | `integration/statement-cache.test.ts` |
| Per-query statement timeout | `sessions.ts#statement-timeout` | `sessions#statement-timeout-per-query` | `integration/session-extras.test.ts` |

## Extras (3)

| Feature | Example | Guide | Test |
| --- | --- | --- | --- |
| Public decorators and sequelize.addModels | `decorators.ts#use` | `decorators#defining-models` | `unit/decorators/coverage-decorators.test.ts` |
| Standard Schema validation (validationSchema) | `hooks-validation.ts#standard-schema` | `hooks-validation#standard-schema` | `integration/lifecycle.test.ts` |
| Model.insert() with wasInserted per row | `upserts.ts#increment` | `upserts#expression-updates-and-wasinserted` | `integration/on-conflict.test.ts` |

## Same as v6 (38, no example required)

- Row locks: FOR UPDATE / NO KEY UPDATE / SHARE / KEY SHARE, OF, NOWAIT, SKIP LOCKED
- RETURNING on INSERT / UPDATE / DELETE
- TRUNCATE
- Comparison and logical operators (=, <>, <, >, BETWEEN, IN, IS NULL, AND/OR/NOT)
- LIKE / ILIKE patterns
- POSIX regular expressions (~, ~*, !~, !~*)
- JSON / JSONB containment, nested paths and key-exists (@>, #>>, ?, ?|, ?&)
- Array operators (@>, <@, &&, ANY, ALL)
- Range operators (@>, &&, <<, >>, &<, &>, -|-)
- UUID functions (gen_random_uuid, uuidv7)
- Any SQL function or expression through fn(), cast(), col(), literal()
- smallint, integer, bigint, serial, identity
- numeric / decimal, real, double precision
- text, varchar, char, boolean
- timestamptz, date, time
- bytea
- enum (CREATE TYPE … AS ENUM)
- arrays (including arrays of enum)
- range types (int4range, int8range, numrange, daterange, tsrange, tstzrange)
- json and jsonb
- uuid
- inet, cidr, macaddr
- tsvector
- citext (extension)
- hstore (extension)
- Tables from models (sync, force, alter) and createTable / dropTable
- Primary key, unique, check and foreign-key constraints with referential actions
- DEFERRABLE constraints
- Indexes: unique, partial, covering (INCLUDE), GIN, BRIN, CONCURRENTLY, IF NOT EXISTS
- ALTER TABLE: add / change / rename / remove column, rename table
- Enum ALTER (ADD VALUE)
- Comments on tables and columns
- Schemas
- Introspection (describeTable, showAllTables, tableExists, foreign keys)
- Transactions: managed, unmanaged, CLS, afterCommit hooks
- Isolation levels
- Savepoints (nested transactions)
- Bound parameters and replacements in raw queries

## Decisions per row

Rows were classed by whether Sequelize 6.37 has a public API for the same capability. Borderline calls: read replicas (v6 has `replication`, postgrelize adds routing semantics: kept as beyond), `READ ONLY` transactions, `UUID functions` and `HSTORE` / `CITEXT` / `TSVECTOR` types (v6 has them: same), `= ANY($1)` (invisible behaviour, kept as beyond so it gets an example).
