/**
 * PostgreSQL coverage matrix: the source of truth for the "PostgreSQL coverage" page.
 * `tests/docs/postgresql-matrix.test.ts` checks that every `supported` row points to a real test.
 */

/** How a feature is available. */
export type FeatureStatus = 'supported' | 'literal' | 'planned' | 'out-of-scope';

/** Oldest PostgreSQL major version that has the feature (the package supports 16–18). */
export type MinPg = '16' | '17' | '18';

/** Test that exercises a feature: a file path from the repository root and a name found in it. */
export type TestRef = Readonly<{ file: string; name: string }>;

/** One user-visible PostgreSQL capability. */
export type FeatureRow = Readonly<{
  area: string;
  feature: string;
  minPg: MinPg;
  status: FeatureStatus;
  /** Required for `supported`. */
  test?: TestRef;
  /** `supported`: how to use it. Other statuses (required): the workaround or the reason. */
  note: string;
}>;

const PG = 'tests/integration/pg-coverage.test.ts';
const TYPES_I = 'tests/integration/types-i.test.ts';
const POSTGIS = 'tests/integration/postgis.test.ts';
const TYPES_II = 'tests/integration/types-ii.test.ts';
const POWER = 'tests/integration/query-power.test.ts';
const WRITE = 'tests/integration/write-power.test.ts';
const CONFLICT = 'tests/integration/on-conflict.test.ts';
const SX = 'tests/integration/session-extras.test.ts';
const CONN = 'tests/integration/connection-power.test.ts';
const OPH = 'tests/integration/operator-helpers.test.ts';
const BASE = 'tests/integration/postgrelize.test.ts';
const SCHEMA_POWER = 'tests/integration/schema-power.test.ts';
const SCHEMA = 'tests/integration/schema.test.ts';
const FNTRIG = 'tests/compat/functions-triggers.test.ts';
const OBJECTS = 'tests/integration/ddl-objects.test.ts';
const CTE = 'tests/integration/cte-copy-to.test.ts';
const CTEX = 'tests/integration/cte-extras.test.ts';
const SETOPS = 'tests/integration/set-ops-from.test.ts';
const ISSUES = 'tests/integration/sequelize-issues.test.ts';
const CRUD = 'tests/compat/crud.test.ts';
const QI = 'tests/compat/query-interface.test.ts';

const t = (file: string, name: string): TestRef => ({ file, name });

const SELECT = 'SELECT clauses';
const DML = 'DML';
const OPS = 'Operators and functions';
const TYPES = 'Data types';
const DDL = 'DDL (sync and QueryInterface)';
const SESSION = 'Session features';
const OUT = 'Out of scope';

/** Areas in display order. */
export const AREAS: readonly string[] = [SELECT, DML, OPS, TYPES, DDL, SESSION, OUT];

/** All rows of the matrix. */
export const POSTGRESQL_FEATURES: readonly FeatureRow[] = [
  // SELECT clauses
  { area: SELECT, feature: 'DISTINCT ON', minPg: '16', status: 'supported', test: t(POWER, 'returns the top post per user with DISTINCT ON'), note: '`distinctOn` find option.' },
  { area: SELECT, feature: 'Window functions (OVER, PARTITION BY)', minPg: '16', status: 'supported', test: t(POWER, 'ranks rows with window functions'), note: '`over()` expression; named `WINDOW` clauses and frame clauses are not modelled.' },
  { area: SELECT, feature: 'CTEs and WITH RECURSIVE', minPg: '16', status: 'supported', test: t(CTE, 'walks a tree with WITH RECURSIVE'), note: '`with` find option.' },
  { area: SELECT, feature: 'CTE MATERIALIZED / NOT MATERIALIZED', minPg: '16', status: 'supported', test: t(CTE, 'uses materialized CTEs'), note: '`materialized` flag of a CTE definition.' },
  { area: SELECT, feature: 'Data-modifying CTEs (WITH … UPDATE/DELETE … RETURNING)', minPg: '16', status: 'supported', test: t(CTEX, 'deletes rows and reads the deleted rows through source'), note: '`Model.updateStatement()`, `deleteStatement()`, `insertStatement()` in `with`; the query goes to the writer. `INSERT … SELECT FROM cte` as the main statement is not supported.' },
  { area: SELECT, feature: 'CTE SEARCH / CYCLE clauses', minPg: '16', status: 'supported', test: t(CTEX, 'orders a tree depth first and breadth first'), note: '`search` and `cycle` in a recursive `with` definition; `cycle.using` is required.' },
  { area: SELECT, feature: 'LATERAL joins', minPg: '16', status: 'supported', test: t(SETOPS, 'correlates a LATERAL subquery with the model row'), note: '`from: { alias: { lateral: subquery } }`; `lateral: true` on a `separate` include with `limit` reads the top rows per parent.' },
  { area: SELECT, feature: 'GROUPING SETS / ROLLUP / CUBE', minPg: '16', status: 'literal', test: t(PG, 'groups with GROUPING SETS / ROLLUP through literal()'), note: '`group: literal("ROLLUP (a, b)")`. `GROUPING()` through `fn("grouping", …)`.' },
  { area: SELECT, feature: 'Row locks: FOR UPDATE / NO KEY UPDATE / SHARE / KEY SHARE, OF, NOWAIT, SKIP LOCKED', minPg: '16', status: 'supported', test: t(PG, 'renders every row-lock strength with OF, NOWAIT and SKIP LOCKED'), note: '`lock`, `skipLocked`, `noWait` find options.' },
  { area: SELECT, feature: 'ORDER BY … NULLS FIRST / LAST', minPg: '16', status: 'supported', test: t(PG, 'orders with NULLS FIRST / NULLS LAST'), note: 'Order direction string, e.g. `["rank", "ASC NULLS LAST"]`.' },
  { area: SELECT, feature: 'TABLESAMPLE', minPg: '16', status: 'supported', test: t(SETOPS, 'samples the model table and keeps the percent bound'), note: '`sample: { method, percent, seed }` find option and `{ model, sample }` in `from`.' },
  { area: SELECT, feature: 'FETCH FIRST … WITH TIES', minPg: '16', status: 'supported', test: t(SETOPS, 'returns rows that tie with the last one'), note: '`withTies: true` with `limit` and `order`.' },
  { area: SELECT, feature: 'UNION / INTERSECT / EXCEPT [ALL]', minPg: '16', status: 'supported', test: t(SETOPS, 'combines subqueries with UNION, INTERSECT and EXCEPT in IN filters'), note: '`Subquery#union()`, `intersect()`, `except()` (`{ all: true }`); `source: subquery` reads model rows from the result.' },
  { area: SELECT, feature: 'Subqueries (IN, scalar, EXISTS / NOT EXISTS, correlated)', minPg: '16', status: 'supported', test: t(POWER, 'supports EXISTS / NOT EXISTS with correlated subqueries'), note: '`Model.subquery()`, `exists()`, `notExists()`; `IN (subquery)` in `where`.' },
  { area: SELECT, feature: 'Row-value comparison (keyset pagination)', minPg: '16', status: 'supported', test: t(POWER, 'paginates with row comparison (keyset)'), note: '`tuple()` expression.' },
  { area: SELECT, feature: 'Standalone VALUES lists and set-returning functions in FROM (unnest, generate_series, WITH ORDINALITY)', minPg: '16', status: 'supported', test: t(SETOPS, 'reads from set-returning functions, with ordinality'), note: '`from` entries `{ values }` and `{ function, args, columns, ordinality }`.' },
  { area: SELECT, feature: 'Aggregates with FILTER, ORDER BY and ordered-set forms', minPg: '16', status: 'literal', note: 'Plain aggregates through `fn()`; `FILTER (WHERE …)` and `WITHIN GROUP` through `literal()`.' },
  { area: SELECT, feature: 'ONLY (table inheritance)', minPg: '16', status: 'out-of-scope', note: 'Legacy inheritance; partitioning is the supported way to split tables.' },

  // DML
  { area: DML, feature: 'INSERT … ON CONFLICT DO NOTHING', minPg: '16', status: 'supported', test: t(CONFLICT, 'DO NOTHING returns only inserted rows'), note: '`onConflict` with `action: "nothing"`.' },
  { area: DML, feature: 'ON CONFLICT DO UPDATE with expressions and inserted/updated flag', minPg: '16', status: 'supported', test: t(CONFLICT, 'increments with an expression and reports inserted/updated rows'), note: '`onConflict` update action with `excluded()`; `Model.insert()` reports `wasInserted`.' },
  { area: DML, feature: 'ON CONFLICT DO UPDATE … WHERE', minPg: '16', status: 'supported', test: t(CONFLICT, 'updates only when the incoming version is newer'), note: '`where` of the `onConflict` update action.' },
  { area: DML, feature: 'ON CONFLICT ON CONSTRAINT, expression and partial-index targets', minPg: '16', status: 'supported', test: t(CONFLICT, 'targets an expression index'), note: '`onConflict` targets: `constraint`, columns or expressions, with `where`.' },
  { area: DML, feature: 'INSERT … OVERRIDING SYSTEM / USER VALUE', minPg: '16', status: 'supported', test: t(ISSUES, '#14497 upsert with overriding'), note: '`overriding: "system" | "user"` write option.' },
  { area: DML, feature: 'INSERT … SELECT', minPg: '16', status: 'supported', test: t(WRITE, 'inserts rows from a subquery with onConflict'), note: '`Model.insertFrom()`.' },
  { area: DML, feature: 'UPDATE … FROM and DELETE … USING', minPg: '16', status: 'supported', test: t(WRITE, 'updates from another table and deletes using another table'), note: '`from` option of `Model.update`, `using` option of `Model.destroy`.' },
  { area: DML, feature: 'UPDATE SET (a, b) = (sub-SELECT) and WHERE CURRENT OF', minPg: '16', status: 'literal', note: 'Per-column expressions work through `literal()`; row-assignment forms need a raw query.' },
  { area: DML, feature: 'MERGE (WHEN MATCHED / NOT MATCHED, DELETE, DO NOTHING)', minPg: '16', status: 'supported', test: t(WRITE, 'merges value rows: update matched, insert new, delete by condition'), note: '`Model.merge()` with VALUES or subquery source.' },
  { area: DML, feature: 'MERGE … RETURNING merge_action() and WHEN NOT MATCHED BY SOURCE', minPg: '17', status: 'supported', test: t(WRITE, 'returns actions and handles NOT MATCHED BY SOURCE'), note: 'Rejected before running on servers older than 17.' },
  { area: DML, feature: 'RETURNING on INSERT / UPDATE / DELETE', minPg: '16', status: 'supported', test: t(BASE, 'destroy with returning returns deleted instances'), note: '`returning` option of create, bulkCreate, update, destroy.' },
  { area: DML, feature: 'RETURNING OLD (pre-statement values)', minPg: '18', status: 'supported', test: t('tests/integration/returning-old.test.ts', 'returns pre-statement values'), note: '`returningOld` → `instance.oldValues`. `RETURNING NEW` is the default row.' },
  { area: DML, feature: 'TRUNCATE', minPg: '16', status: 'supported', test: t(CRUD, 'truncate'), note: '`Model.truncate()`.' },
  { area: DML, feature: 'COPY FROM STDIN (bulk load)', minPg: '16', status: 'supported', test: t(CONN, 'bulk-loads rows from arrays and async iterables with escaping'), note: '`Model.copyFrom()` streams arrays and async iterables.' },
  { area: DML, feature: 'COPY TO STDOUT (export)', minPg: '16', status: 'supported', test: t(CTE, 'exports CSV with header, quoting and NULL handling'), note: '`Model.copyTo()` returns an async iterable.' },
  { area: DML, feature: 'Bulk insert via UNNEST arrays', minPg: '16', status: 'supported', test: t(SX, 'inserts past the 65535 parameter limit with one array parameter per column'), note: '`bulkCreate(rows, { unnest: true })`.' },

  // Operators and functions
  { area: OPS, feature: 'Comparison and logical operators (=, <>, <, >, BETWEEN, IN, IS NULL, AND/OR/NOT)', minPg: '16', status: 'supported', test: t(CRUD, 'findAll with operators'), note: '`Op.*` as in Sequelize v6.' },
  { area: OPS, feature: 'IS [NOT] DISTINCT FROM', minPg: '16', status: 'supported', test: t(BASE, 'Op.isDistinctFrom / isNotDistinctFrom treat NULL as a value'), note: '`Op.isDistinctFrom`, `Op.isNotDistinctFrom`.' },
  { area: OPS, feature: '= ANY($1) for long IN lists', minPg: '16', status: 'supported', test: t(BASE, 'long IN lists run as = ANY with one parameter'), note: 'Automatic above `inAsAnyThreshold`.' },
  { area: OPS, feature: 'LIKE / ILIKE patterns', minPg: '16', status: 'supported', test: t(PG, 'filters with pattern, regex, array and jsonb operators'), note: '`Op.like`, `Op.iLike`, `Op.startsWith`, `Op.endsWith`, `Op.substring`.' },
  { area: OPS, feature: 'POSIX regular expressions (~, ~*, !~, !~*)', minPg: '16', status: 'supported', test: t(PG, 'filters with pattern, regex, array and jsonb operators'), note: '`Op.regexp`, `Op.iRegexp` and negations.' },
  { area: OPS, feature: 'SIMILAR TO', minPg: '16', status: 'supported', test: t(OPH, 'matches SQL regular expressions with Op.similarTo and Op.notSimilarTo'), note: '`Op.similarTo`, `Op.notSimilarTo`.' },
  { area: OPS, feature: 'JSON / JSONB containment, nested paths and key-exists (@>, #>>, ?, ?|, ?&)', minPg: '16', status: 'supported', test: t(BASE, 'jsonb key operators'), note: 'Nested `where` objects, `Op.contains`, `Op.hasKey`, `Op.hasAnyKeys`, `Op.hasAllKeys`.' },
  { area: OPS, feature: 'jsonpath operators (@?, @@) and jsonb_path_* functions', minPg: '16', status: 'supported', test: t(OPH, 'filters jsonb with jsonpath operators and jsonb_path_* helpers'), note: '`Op.jsonPathExists` (`@?`), `Op.match` through `where()` (`@@`), `jsonbPath()` for the `jsonb_path_*` functions.' },
  { area: OPS, feature: 'SQL/JSON constructors and query functions (JSON_EXISTS, JSON_QUERY, JSON_VALUE)', minPg: '17', status: 'literal', note: 'Through `literal()` in attributes or `where`.' },
  { area: OPS, feature: 'JSON_TABLE', minPg: '17', status: 'supported', test: t(SETOPS, 'turns a document into rows on PostgreSQL 17+'), note: '`from` entry `{ jsonTable: { doc, path, columns } }`; `NESTED PATH` is not modelled.' },
  { area: OPS, feature: 'Array operators (@>, <@, &&, ANY, ALL)', minPg: '16', status: 'supported', test: t(PG, 'filters with pattern, regex, array and jsonb operators'), note: '`Op.contains`, `Op.contained`, `Op.overlap`, `Op.any`, `Op.all`.' },
  { area: OPS, feature: 'Range operators (@>, &&, <<, >>, &<, &>, -|-)', minPg: '16', status: 'supported', test: t(PG, 'stores ranges and filters them with range operators'), note: '`Op.contains`, `Op.overlap`, `Op.strictLeft`, `Op.strictRight`, `Op.noExtendLeft`, `Op.noExtendRight`, `Op.adjacent`.' },
  { area: OPS, feature: 'Multirange operators and functions (range_agg, unnest)', minPg: '16', status: 'supported', test: t(TYPES_II, 'round-trips multiranges and filters with range operators'), note: 'Range operators (`Op.contains`, `Op.overlap`, `Op.strictLeft`, …) on multirange columns; `range_agg`, `unnest` through `fn()`.' },
  { area: OPS, feature: 'Full-text search match (@@)', minPg: '16', status: 'supported', test: t(PG, 'stores tsvector and matches it with a tsquery'), note: '`Op.match` with `fn("to_tsquery", …)` / `fn("websearch_to_tsquery", …)`.' },
  { area: OPS, feature: 'Full-text ranking and highlighting (ts_rank, ts_headline, setweight)', minPg: '16', status: 'supported', test: t(OPH, 'searches, ranks and highlights text'), note: '`tsRank` (also `ts_rank_cd`), `tsHeadline`, `setWeight`, `toTsVector`, `toTsQuery`, `plainToTsQuery`, `phraseToTsQuery`, `websearchToTsQuery` with an optional configuration.' },
  { area: OPS, feature: 'Network operators (<<, <<=, >>, >>=, host(), network())', minPg: '16', status: 'supported', test: t(OPH, 'filters inet and cidr with subnet operators'), note: '`Op.strictLeft`, `Op.strictRight`, `Op.containedOrEqual`, `Op.containsOrEqual`, `Op.overlap`; `host()` and `network()` through `fn()`.' },
  { area: OPS, feature: 'Geometric operators and functions', minPg: '16', status: 'supported', test: t(TYPES_II, 'filters with geometric operators'), note: '`Op.contains`, `Op.contained`, `Op.overlap`, `Op.strictLeft`, `Op.strictRight` on geometric columns; operands of another type need `cast()`; `<->`, `?#` and functions through `literal()` / `fn()`.' },
  { area: OPS, feature: 'hstore operators (->, ?, @>)', minPg: '16', status: 'supported', test: t(TYPES_I, 'round-trips hstore as objects and filters with hstore operators'), note: '`Op.contains` and `Op.eq` take objects; `->`, `?` and other operators through `literal()`.' },
  { area: OPS, feature: 'ltree operators (@>, <@, ~, ?)', minPg: '16', status: 'literal', note: 'Equality and `IN` work on `DataTypes.LTREE` columns; `<@`, `@>`, `~` and `?` through `literal()` (see the ltree row in Data types).' },
  { area: OPS, feature: 'pg_trgm similarity (%, similarity(), word_similarity())', minPg: '16', status: 'supported', test: t(OPH, 'filters and orders by pg_trgm similarity'), note: '`Op.trigramSimilar` and word variants, `trigramSimilarity()`, `trigramWordSimilarity()`, `trigramDistance()` (`<->`); needs `CREATE EXTENSION pg_trgm`; the `gin_trgm_ops` index uses the `operator` index option.' },
  { area: OPS, feature: 'UUID functions (gen_random_uuid, uuidv7)', minPg: '16', status: 'supported', test: t(PG, 'calls any SQL function through fn() and literal()'), note: '`fn("gen_random_uuid")` as default or expression; `uuidv7()` needs PostgreSQL 18; `DataTypes.UUIDV4` generates client-side.' },
  { area: OPS, feature: 'Interval arithmetic and date functions (date_trunc, age, make_interval)', minPg: '16', status: 'literal', note: 'Through `fn()` / `literal()`; the INTERVAL column type is supported.' },
  { area: OPS, feature: 'Any SQL function or expression through fn(), cast(), col(), literal()', minPg: '16', status: 'supported', test: t(PG, 'calls any SQL function through fn() and literal()'), note: 'Function names pass an allowlist; `literal()` is raw by design.' },

  // Data types
  { area: TYPES, feature: 'smallint, integer, bigint, serial, identity', minPg: '16', status: 'supported', test: t(PG, 'round-trips numeric, text, boolean and date types'), note: '`SMALLINT`, `INTEGER`, `BIGINT` (returned as string), `autoIncrement` (serial or identity).' },
  { area: TYPES, feature: 'numeric / decimal, real, double precision', minPg: '16', status: 'supported', test: t(PG, 'round-trips numeric, text, boolean and date types'), note: '`DECIMAL(p, s)` returned as string; `REAL`, `DOUBLE`, `FLOAT`.' },
  { area: TYPES, feature: 'text, varchar, char, boolean', minPg: '16', status: 'supported', test: t(PG, 'round-trips numeric, text, boolean and date types'), note: '`TEXT`, `STRING(n)`, `CHAR(n)`, `BOOLEAN`.' },
  { area: TYPES, feature: 'timestamptz, date, time', minPg: '16', status: 'supported', test: t(PG, 'round-trips numeric, text, boolean and date types'), note: '`DATE` (timestamptz), `DATEONLY`, `TIME`.' },
  { area: TYPES, feature: 'timestamp without time zone', minPg: '16', status: 'supported', test: t(TYPES_I, 'round-trips timestamp columns as local wall-clock Dates'), note: '`DataTypes.TIMESTAMP(fsp?)`; values are `Date`s with the local wall-clock time.' },
  { area: TYPES, feature: 'interval', minPg: '16', status: 'supported', test: t(PG, 'round-trips inet, cidr, macaddr and interval'), note: '`DataTypes.INTERVAL`.' },
  { area: TYPES, feature: 'money', minPg: '16', status: 'supported', test: t(TYPES_I, 'round-trips money and filters by amount'), note: '`DataTypes.MONEY`; read as the server formats it (`lc_monetary`, e.g. `$12.50`); write numbers or strings.' },
  { area: TYPES, feature: 'bytea', minPg: '16', status: 'supported', test: t(PG, 'round-trips uuid, bytea, jsonb and arrays'), note: '`DataTypes.BLOB` ↔ `Buffer`.' },
  { area: TYPES, feature: 'enum (CREATE TYPE … AS ENUM)', minPg: '16', status: 'supported', test: t(SCHEMA_POWER, 'adds new enum values to the existing type'), note: '`DataTypes.ENUM`; `sync({ alter })` adds new values.' },
  { area: TYPES, feature: 'composite types', minPg: '16', status: 'supported', test: t(TYPES_II, 'round-trips composite values and filters by them'), note: '`DataTypes.COMPOSITE(name, fields)` with object values; `createSql()` renders `CREATE TYPE`; array fields are not supported.' },
  { area: TYPES, feature: 'domains', minPg: '16', status: 'literal', note: 'Create with raw DDL, then use the base type in the model; the type name cannot be set directly.' },
  { area: TYPES, feature: 'arrays (including arrays of enum)', minPg: '16', status: 'supported', test: t(PG, 'round-trips uuid, bytea, jsonb and arrays'), note: '`DataTypes.ARRAY(type)`.' },
  { area: TYPES, feature: 'range types (int4range, int8range, numrange, daterange, tsrange, tstzrange)', minPg: '16', status: 'supported', test: t(PG, 'stores ranges and filters them with range operators'), note: '`DataTypes.RANGE(type)` with `[lower, upper]` values.' },
  { area: TYPES, feature: 'multirange types', minPg: '16', status: 'supported', test: t(TYPES_II, 'round-trips multiranges and filters with range operators'), note: '`DataTypes.MULTIRANGE(type)` (PostgreSQL 14+) with arrays of `[lower, upper]` ranges.' },
  { area: TYPES, feature: 'json and jsonb', minPg: '16', status: 'supported', test: t(PG, 'round-trips uuid, bytea, jsonb and arrays'), note: '`DataTypes.JSON`, `DataTypes.JSONB`.' },
  { area: TYPES, feature: 'xml', minPg: '16', status: 'supported', test: t(TYPES_I, 'round-trips xml'), note: '`DataTypes.XML`; values are XML text; `xpath()` through `literal()` / `fn()`.' },
  { area: TYPES, feature: 'bit and bit varying', minPg: '16', status: 'supported', test: t(TYPES_I, 'round-trips bit and bit varying'), note: '`DataTypes.BIT(n)`, `DataTypes.VARBIT(n)`; values are strings of `0` and `1`.' },
  { area: TYPES, feature: 'uuid', minPg: '16', status: 'supported', test: t(PG, 'round-trips uuid, bytea, jsonb and arrays'), note: '`DataTypes.UUID` with `UUIDV4` client default.' },
  { area: TYPES, feature: 'inet, cidr, macaddr', minPg: '16', status: 'supported', test: t(PG, 'round-trips inet, cidr, macaddr and interval'), note: '`DataTypes.INET`, `CIDR`, `MACADDR`.' },
  { area: TYPES, feature: 'macaddr8', minPg: '16', status: 'supported', test: t(TYPES_I, 'round-trips macaddr8'), note: '`DataTypes.MACADDR8`.' },
  { area: TYPES, feature: 'geometric types (point, line, lseg, box, path, polygon, circle)', minPg: '16', status: 'supported', test: t(TYPES_II, 'round-trips every geometric type'), note: '`DataTypes.POINT`, `LINE`, `LSEG`, `BOX`, `PATH`, `POLYGON`, `CIRCLE` with object / point-array values.' },
  { area: TYPES, feature: 'tsvector', minPg: '16', status: 'supported', test: t(PG, 'stores tsvector and matches it with a tsquery'), note: '`DataTypes.TSVECTOR`.' },
  { area: TYPES, feature: 'tsquery', minPg: '16', status: 'supported', test: t(TYPES_I, 'round-trips tsquery and matches tsvector against it'), note: '`DataTypes.TSQUERY`; values are query strings (`\'fat\' & \'rat\'`).' },
  { area: TYPES, feature: 'pg_lsn, txid_snapshot and other system types', minPg: '16', status: 'out-of-scope', note: 'Replication and internals types; read through raw queries.' },
  { area: TYPES, feature: 'citext (extension)', minPg: '16', status: 'supported', test: t(PG, 'stores citext with an extension'), note: '`DataTypes.CITEXT`; run `CREATE EXTENSION citext` first.' },
  { area: TYPES, feature: 'hstore (extension)', minPg: '16', status: 'supported', test: t(TYPES_I, 'round-trips hstore as objects and filters with hstore operators'), note: '`DataTypes.HSTORE`; values are objects of strings (or `null`); run `CREATE EXTENSION hstore` first.' },
  { area: TYPES, feature: 'ltree (extension)', minPg: '16', status: 'supported', test: t(TYPES_I, 'round-trips ltree paths and matches ltree operators'), note: '`DataTypes.LTREE`; values are strings (`\'Top.Science\'`); run `CREATE EXTENSION ltree` first.' },
  { area: TYPES, feature: 'PostGIS geometry / geography', minPg: '16', status: 'supported', test: t(POSTGIS, 'round-trips GeoJSON through geometry and geography columns'), note: '`DataTypes.GEOMETRY(type, srid)` / `GEOGRAPHY(type, srid)` with GeoJSON values (SRID in `crs`); needs `CREATE EXTENSION postgis`; tests run only where PostGIS is installed (CI job `PostGIS`).' },
  { area: TYPES, feature: 'Stored and virtual generated columns, identity columns', minPg: '16', status: 'supported', test: t(SCHEMA_POWER, 'creates identity and stored generated columns'), note: '`generated: { as, stored }` and `identity: "always" | "byDefault"` column options. `VIRTUAL` generated columns need PostgreSQL 18.' },

  // DDL
  { area: DDL, feature: 'Tables from models (sync, force, alter) and createTable / dropTable', minPg: '16', status: 'supported', test: t(QI, 'creates tables, enums, indexes and foreign keys like v6'), note: '`sequelize.sync()`, `QueryInterface.createTable()`.' },
  { area: DDL, feature: 'Primary key, unique, check and foreign-key constraints with referential actions', minPg: '16', status: 'supported', test: t(SCHEMA, 'applies association foreign keys with v6 referential actions'), note: '`addConstraint`, column `references`, `onDelete`, `onUpdate`.' },
  { area: DDL, feature: 'DEFERRABLE constraints', minPg: '16', status: 'supported', test: t(PG, 'creates deferrable foreign keys'), note: '`Deferrable` values on `references`.' },
  { area: DDL, feature: 'UNIQUE NULLS NOT DISTINCT', minPg: '16', status: 'supported', test: t(SCHEMA, 'creates UNIQUE NULLS NOT DISTINCT constraints and indexes'), note: '`nullsNotDistinct` on unique columns, constraints and indexes.' },
  { area: DDL, feature: 'EXCLUDE constraints', minPg: '16', status: 'planned', note: '`addConstraint` has no exclusion type; `ExclusionConstraintError` is already mapped. Workaround: raw DDL.' },
  { area: DDL, feature: 'NOT VALID constraints and VALIDATE CONSTRAINT', minPg: '16', status: 'planned', note: 'Online migration pattern for large tables. Workaround: raw DDL.' },
  { area: DDL, feature: 'NOT ENFORCED constraints, WITHOUT OVERLAPS keys, FK PERIOD', minPg: '18', status: 'planned', note: 'PostgreSQL 18 constraint forms. Workaround: raw DDL.' },
  { area: DDL, feature: 'Indexes: unique, partial, covering (INCLUDE), GIN, BRIN, CONCURRENTLY, IF NOT EXISTS', minPg: '16', status: 'supported', test: t(PG, 'creates partial, expression, covering, GIN and concurrent indexes'), note: '`addIndex` / model `indexes`: `where`, `include`, `using`, `operator`, `concurrently`, `ifNotExists`. GiST, SP-GiST and hash go through `using`.' },
  { area: DDL, feature: 'Expression indexes (lower(email))', minPg: '16', status: 'planned', note: '`IndexField.name` is a column. Workaround: raw DDL (an `onConflict` target on an expression index already works).' },
  { area: DDL, feature: 'ALTER TABLE: add / change / rename / remove column, rename table', minPg: '16', status: 'supported', test: t(QI, 'column, index and constraint operations'), note: '`QueryInterface` methods.' },
  { area: DDL, feature: 'Enum ALTER (ADD VALUE)', minPg: '16', status: 'supported', test: t(SCHEMA_POWER, 'adds new enum values to the existing type'), note: '`sync({ alter: true })`; `dropEnum` and `dropAllEnums`.' },
  { area: DDL, feature: 'Comments on tables and columns', minPg: '16', status: 'supported', test: t(PG, 'sets table comments and creates identity columns'), note: '`comment` option on `createTable` and columns.' },
  { area: DDL, feature: 'Schemas', minPg: '16', status: 'supported', test: t(QI, 'creates, lists and drops schemas through the Sequelize instance'), note: '`createSchema`, `dropSchema`, `showAllSchemas`, model `schema` option.' },
  { area: DDL, feature: 'Introspection (describeTable, showAllTables, tableExists, foreign keys)', minPg: '16', status: 'supported', test: t(ISSUES, 'describeTable reads enum values of the column type in its own schema'), note: '`QueryInterface`; every query filters by schema.' },
  { area: DDL, feature: 'Views and materialized views', minPg: '16', status: 'supported', test: t(OBJECTS, 'creates, refreshes and drops materialized views'), note: '`createView` (`replace`, `temporary`, `recursive`, `checkOption`), `createMaterializedView`, `refreshMaterializedView` (`concurrently`), `dropView`, `dropMaterializedView`; the query is trusted SQL.' },
  { area: DDL, feature: 'Sequences (CREATE SEQUENCE, setval)', minPg: '16', status: 'supported', test: t(OBJECTS, 'creates, advances, alters and drops a sequence'), note: '`createSequence`, `alterSequence`, `dropSequence`, `nextval`, `setval`; serial and identity sequences stay with `autoIncrement`.' },
  { area: DDL, feature: 'Functions and triggers', minPg: '16', status: 'supported', test: t(FNTRIG, 'fires a row trigger on insert and update'), note: '`createFunction`, `dropFunction`, `renameFunction`, `createTrigger`, `dropTrigger`, `renameTrigger` with the v6 names; bodies and `WHEN` clauses are trusted SQL.' },
  { area: DDL, feature: 'Declarative partitioning (PARTITION BY / PARTITION OF / ATTACH)', minPg: '16', status: 'planned', note: 'Workaround: raw DDL; queries against the parent table work.' },
  { area: DDL, feature: 'Extensions (CREATE EXTENSION)', minPg: '16', status: 'supported', test: t(OBJECTS, 'creates and drops an extension'), note: '`createExtension`, `dropExtension` with `ifNotExists`, `schema`, `version`, `cascade`.' },
  { area: DDL, feature: 'Row-level security policies', minPg: '16', status: 'supported', test: t(OBJECTS, 'enforces policies for a non-owner role'), note: '`enableRowLevelSecurity`, `disableRowLevelSecurity`, `createPolicy`, `alterPolicy`, `dropPolicy`; string conditions are trusted SQL, where objects are escaped.' },
  { area: DDL, feature: 'UNLOGGED and TEMPORARY tables', minPg: '16', status: 'supported', test: t(OBJECTS, 'creates unlogged tables with createTable and with models'), note: '`unlogged` and `temporary` options on `createTable` and on model options (`sync`); a temporary table lives in one session, so use a transaction.' },
  { area: DDL, feature: 'Rules (CREATE RULE)', minPg: '16', status: 'out-of-scope', note: 'Legacy mechanism; triggers and views cover the use cases.' },

  // Session features
  { area: SESSION, feature: 'Transactions: managed, unmanaged, CLS, afterCommit hooks', minPg: '16', status: 'supported', test: t(BASE, 'CLS picks up the managed transaction automatically'), note: '`sequelize.transaction()`.' },
  { area: SESSION, feature: 'Isolation levels', minPg: '16', status: 'supported', test: t(PG, 'applies transaction isolation levels'), note: '`isolationLevel` option.' },
  { area: SESSION, feature: 'READ ONLY transactions', minPg: '16', status: 'supported', test: t(PG, 'starts READ ONLY transactions'), note: '`readOnly: true`.' },
  { area: SESSION, feature: 'DEFERRABLE transaction mode (SERIALIZABLE READ ONLY DEFERRABLE)', minPg: '16', status: 'supported', test: t(SX, 'starts SERIALIZABLE READ ONLY DEFERRABLE and NOT DEFERRABLE'), note: '`deferrable` transaction option.' },
  { area: SESSION, feature: 'Savepoints (nested transactions)', minPg: '16', status: 'supported', test: t(BASE, 'nested transactions use savepoints'), note: 'A `transaction` option inside a transaction creates a savepoint.' },
  { area: SESSION, feature: 'Advisory locks', minPg: '16', status: 'supported', test: t(CONN, 'serializes work with advisory locks'), note: '`sequelize.withAdvisoryLock()`, `transaction.advisoryLock()`.' },
  { area: SESSION, feature: 'LISTEN / NOTIFY', minPg: '16', status: 'supported', test: t(CONN, 'delivers notifications and unsubscribes'), note: '`sequelize.listen()`, `sequelize.notify()` on a dedicated client.' },
  { area: SESSION, feature: 'SET LOCAL settings (statement_timeout, lock_timeout, RLS variables, search_path)', minPg: '16', status: 'supported', test: t(CONN, 'applies SET LOCAL settings only inside the transaction'), note: '`settings` transaction option.' },
  { area: SESSION, feature: 'Server-side cursors and streaming (findEach)', minPg: '16', status: 'supported', test: t(CONN, 'streams rows in batches with a cursor and closes it on early exit'), note: '`Model.findEach()`.' },
  { area: SESSION, feature: 'COPY streaming with backpressure', minPg: '16', status: 'supported', test: t(CTE, 'handles backpressure, early exit and errors without breaking the pool'), note: '`copyTo` is an async iterable; `copyFrom` accepts async iterables.' },
  { area: SESSION, feature: 'Read replicas', minPg: '16', status: 'supported', test: t('tests/integration/replication.test.ts', 'routes reads to readers and writes to the writer'), note: '`replication: { read, write }`, `useMaster`.' },
  { area: SESSION, feature: 'Bound parameters and replacements in raw queries', minPg: '16', status: 'supported', test: t(PG, 'runs raw queries with bind parameters and replacements'), note: '`sequelize.query()` with `bind` and `replacements`.' },
  { area: SESSION, feature: 'Named prepared statements', minPg: '16', status: 'supported', test: t('tests/integration/statement-cache.test.ts', 'creates named statements only when enabled'), note: '`statementCache` option; opt-in, bounded per connection, ADR-023.' },
  { area: SESSION, feature: 'SSL / TLS connections', minPg: '16', status: 'literal', note: 'The `ssl` option and `dialectOptions` pass through to `pg`; no test runs against a TLS server.' },
  { area: SESSION, feature: 'Per-query statement timeout', minPg: '16', status: 'supported', test: t(SX, 'cancels a slow query and leaves the pooled connection untouched'), note: '`statementTimeout` query option (ms).' },
  { area: SESSION, feature: 'EXPLAIN / EXPLAIN ANALYZE', minPg: '16', status: 'literal', note: '`sequelize.query("EXPLAIN (FORMAT JSON) …")`.' },
  { area: SESSION, feature: 'Two-phase commit (PREPARE TRANSACTION)', minPg: '16', status: 'out-of-scope', note: 'Needs a transaction manager outside the ORM.' },

  // Out of scope
  { area: OUT, feature: 'Roles, GRANT / REVOKE, default privileges', minPg: '16', status: 'out-of-scope', note: 'Server administration; use migrations with raw SQL or your infrastructure tooling.' },
  { area: OUT, feature: 'Replication setup (publications, subscriptions, slots, logical decoding)', minPg: '16', status: 'out-of-scope', note: 'Operations concern, not data access. Replica reads are supported.' },
  { area: OUT, feature: 'Tablespaces', minPg: '16', status: 'out-of-scope', note: 'Storage layout is an operations concern.' },
  { area: OUT, feature: 'VACUUM, ANALYZE, REINDEX, CLUSTER, pg_stat views', minPg: '16', status: 'out-of-scope', note: 'Maintenance; run through a raw query when needed.' },
  { area: OUT, feature: 'Procedural languages (PL/pgSQL bodies, DO blocks, procedures)', minPg: '16', status: 'out-of-scope', note: 'The ORM does not author server-side code; calling `fn()` works. Creating functions is tracked under DDL.' },
  { area: OUT, feature: 'Extension internals (writing or configuring extensions)', minPg: '16', status: 'out-of-scope', note: 'Types and operators of popular extensions are covered above; their administration is not.' },
  { area: OUT, feature: 'Foreign data wrappers and foreign tables', minPg: '16', status: 'out-of-scope', note: 'Server configuration; a foreign table can be modelled like a regular table.' },
  { area: OUT, feature: 'Server configuration (ALTER SYSTEM, pg_hba.conf, event triggers)', minPg: '16', status: 'out-of-scope', note: 'Server administration.' },
];
