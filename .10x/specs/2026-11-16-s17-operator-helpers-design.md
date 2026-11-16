# S17 — Operator helpers (design)

Backlog 4, stage S17. Promotes five `literal` matrix rows to `supported`: SIMILAR TO, jsonpath, full-text ranking/highlighting, network operators, `pg_trgm`. Everything is new API; v6 semantics and existing `Op` behaviour do not change. No ADR: all additions are additive and cheap to reverse.

## Decisions

- **New `Op` entries** (all `Symbol.for('postgrelize.<name>')`, compiled by the existing `binaryOps` table, values bound):
  - `Op.similarTo` / `Op.notSimilarTo` → `SIMILAR TO` / `NOT SIMILAR TO`
  - `Op.jsonPathExists` → `@?` (jsonb `@?` jsonpath). `@@` for jsonpath predicates is the existing `Op.match`.
  - `Op.containedOrEqual` / `Op.containsOrEqual` → `<<=` / `>>=` (inet/cidr subnets). `<<`, `>>`, `&&` are the existing `Op.strictLeft`, `Op.strictRight`, `Op.overlap`.
  - `Op.trigramSimilar` → `%`, `Op.trigramWordSimilar` → `<%`, `Op.trigramStrictWordSimilar` → `<<%` (`pg_trgm`).
- **Expression helpers** are thin factories returning `Fn` / `Where` (no new expression class, no AST change):
  - Full text: `toTsVector`, `toTsQuery`, `plainToTsQuery`, `phraseToTsQuery`, `websearchToTsQuery` (optional regconfig), `tsRank` (`cd`, `weights`, `normalization`), `tsHeadline` (`config`, `options`), `setWeight`.
  - jsonpath: `jsonbPath(kind, target, path, { vars, silent, tz })` for `jsonb_path_exists | match | query | query_first | query_array` (+ `_tz`).
  - `pg_trgm`: `trigramSimilarity`, `trigramWordSimilarity`, `trigramDistance` (`<->`, a `Where` with the existing comparator allowlist, usable in `order`).
- **Safety (ADR-002 / ADR-020):**
  - Text, patterns, jsonpath, vars and options are bound parameters. Parameters that need a type get an explicit `CAST($n AS regconfig | jsonpath | jsonb | real[] | integer)` so overload resolution never depends on inference.
  - Regconfig names must be plain or schema-qualified identifiers (same rule as function names) and are bound, not interpolated. Weight letters (`A`–`D`) and the jsonpath kind are allowlists; `weights` is four finite numbers; `normalization` an integer 0–63.
  - Function names are fixed in the helper, never user-supplied.
- **Extensions:** `pg_trgm` is not created by the library; the user runs `CREATE EXTENSION pg_trgm`. Integration tests create it in the test database.

## Tests

- Unit (`tests/unit/where/operator-helpers.test.ts`): compiled SQL and values for every Op and helper; validation errors.
- Integration (`tests/integration/operator-helpers.test.ts`): each helper against PostgreSQL.
- Security (`tests/integration/security/operator-helpers.test.ts`): `PAYLOADS` and fast-check properties through every new input, `withCanary`.
- Matrix rows flipped with test references; guide section in `docs/guide/querying.md` with an executed `docs/examples/operator-helpers.ts`.
