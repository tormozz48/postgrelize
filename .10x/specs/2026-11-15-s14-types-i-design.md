# S14 Types I — design

Backlog 4, stage 1. Scope: fix `HSTORE` object mapping and add `LTREE`, `TIMESTAMP`, `MONEY`, `MACADDR8`, `XML`, `BIT` / `VARBIT`, `TSQUERY`. Code stays in `src/data-types/`; no ADR (no costly-to-reverse choice: each type is an additive entry in `DataTypes`).

## HSTORE (bug fix)

`DataTypes.HSTORE` was a plain scalar: objects were sent as JSON text and reads returned hstore text. Sequelize v6 maps objects both ways through `pg-hstore`. New `HstoreType` (`parse` / `serialize`, no dependency):

- `serialize(object)` → `"k"=>"v","k2"=>NULL`; keys and values are always quoted, `\` and `"` escaped; values are `String(v)` (objects → JSON text), `null` → `NULL`, `undefined` keys are skipped. Strings, `null` and arrays pass through, so hstore text still works.
- `parse(text)` → `Record<string, string | null>`.
- The serialized text is one bound parameter, so the where operators (`Op.eq`, `Op.contains`, …) and writes need no change: `serializeWith` already applies the attribute serializer.
- DDL defaults: an object default is serialized, then escaped as a literal (`ColumnDdl.defaultSql`).

v6 does the same (with `pg-hstore` installed), so this is parity, not a divergence: no row in "Bugs fixed", a regression test in `tests/integration/sequelize-issues.test.ts`. A differential test is not possible because `pg-hstore` is not a dev dependency.

## New types

| Type | SQL | JS value |
| --- | --- | --- |
| `LTREE` | `LTREE` | string (needs `CREATE EXTENSION ltree`) |
| `TIMESTAMP(fsp?)` | `TIMESTAMP[(n)] WITHOUT TIME ZONE` | `Date` (driver parses as local time; strings from JSON aggregation are parsed the same way) |
| `MONEY` | `MONEY` | string as the server formats it (`lc_monetary`); numbers accepted on write |
| `MACADDR8` | `MACADDR8` | string (a 6-byte input comes back as EUI-64) |
| `XML` | `XML` | string |
| `BIT(n)` / `VARBIT(n)` | `BIT(n)` / `BIT VARYING(n)` | string of `0` / `1` |
| `TSQUERY` | `TSQUERY` | string |

Only `BIT`, `VARBIT` and `TIMESTAMP` take parameters; they go through `AbstractDataType.integer` (allowlist). Everything else is a bound value. The `DataTypes.TIMESTAMP` name follows the PostgreSQL meaning (`timestamp` = without time zone); `DATE` stays `timestamptz`.

Not done: `TIMESTAMP` as a string type (needs a `connection` type-parser change, which S16 owns), arrays of `HSTORE` (element text is not parsed), `ltree` / `hstore` operator helpers (S17).

## Tests and docs

- Unit: `tests/unit/data-types/types-i.test.ts`. Integration: `tests/integration/types-i.test.ts`. Security: `tests/integration/security/types.test.ts` (hstore property test, payloads on every new column type, default literal, parameter validation).
- Matrix rows flipped to `supported`; `ltree operators` becomes `literal`. Guide section "PostgreSQL-specific types" with `docs/examples/types.ts`; `docs/security.md` rows; README list.
