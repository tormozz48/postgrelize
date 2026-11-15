# SQL-injection review (S5) — 2026-11-15

**Scope:** all of `src/`, every public input that reaches SQL text. **Method:** independent adversarial audit, confirmed against PostgreSQL 16, plus payload/property tests (`tests/integration/security/`) and CodeQL.

## Findings

| # | Severity | Surface | Issue | Status |
|---|---|---|---|---|
| F1 | High | `lock` / `lock.level` | Emitted raw; stacked statements executed (`FOR UPDATE; COMMIT; DROP …`) | Fixed: unknown strengths → `FOR UPDATE` (v6 behaviour) |
| F2 | High | `Model.aggregate(field, fn)` | Function name emitted raw (also raw in v6) | Fixed: validated like `fn()` |
| F3 | Low–Medium | `where(col, comparator, v)` | Allowlist accepted `--`, `/*` (trailing clauses could be commented out) | Fixed: comment tokens rejected |
| F4 | Medium | `transaction({ isolationLevel })` | Emitted raw (also raw in v6) | Fixed: must be one of `ISOLATION_LEVELS` |
| F5 | Low | `deferrable`, DataTypes parameters | Any `{ sql }` object accepted; lengths/precision/srid/shape interpolated | Fixed: only `Deferrable` values; non-negative integers; plain shape names |
| F6 | Info | DDL/COPY inlined placeholders | `$n` matched inside identifiers (`fn('x$1')`) — syntax error only | Fixed: placeholder needs a non-identifier character before `$` |
| F7 | Low | `timezone` option | Injected libpq startup options (`-c search_path=…`) | Fixed: offset or IANA name only |

Each finding has a regression test in `tests/integration/security/audit-findings.test.ts`.

## Verified sound
Value binding (where, JSON paths, operators, writes, upsert, MERGE, onConflict), identifier quoting (names, aliases, schemas, channels), literal escaping (defaults, comments, enum values inside `DO`, partial-index/CHECK conditions, COPY TO filters), `replacements`/`bind` tokenizer, COPY FROM encoder, expression detection (`Symbol.for` tag, not forgeable from JSON).

## Not injection (documented on the Security page)
Arbitrary columns via untrusted `where` keys (v6 behaviour), mass assignment through `update`/`create`, LIKE wildcard semantics of `Op.startsWith`/`substring`/`endsWith`.

## Side finding
`sequelize.createSchema` / `showAllSchemas` / `dropSchema` / `dropAllSchemas` and `queryInterface.dropAllSchemas` were missing (v6 parity) — added with a differential test.

**Verdict:** no open findings.
