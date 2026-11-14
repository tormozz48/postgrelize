# Security — postgrelize-mvp (cycle 1: M0–M2)

## Threat model
Library code runs inside the user's application with the user's DB credentials. Main threat: **SQL injection** through values or option shapes that end up in SQL text, often built from HTTP input (`where`, `order`, `attributes`). Secondary: credential leakage in logs/errors, resource exhaustion.

## Controls
| Surface | Control |
|---|---|
| Values in where / insert / update / raw replacements / bind | Always bound parameters (`$n`); raw-query tokenizer skips strings, identifiers, comments, dollar quotes |
| Identifiers (attributes, columns, aliases, `$nested.col$`, `Op.col`, group, lock `of`) | Always double-quoted via one `quoteIdent` (doubles `"`) |
| JSON paths (`meta.a.b`) | Path array bound as parameter (`#>> $n`) |
| Order direction | Allowlist (`ASC`/`DESC` [+ `NULLS FIRST/LAST`]) |
| Plain string `order` | Rejected (v6 behaviour) |
| `attr::type` in where keys | v6 cast-type allowlist |
| `where(x, '<op>', v)` comparator | Operator pattern allowlist |
| `fn(name)` / `cast(v, type)` | Name / type pattern validation |
| `literal()` | Raw by design — documented "never pass user input" |
| `excluded()` | Only inside onConflict |

## Findings
| # | Severity | Finding | Status |
|---|---|---|---|
| S1 | High | `order: '<string>'` inlined into SQL (`raw(String(order))`) | Fixed — throws like v6 |
| S2 | High | `{ 'attr::<type>': v }` inserted `<type>` unvalidated | Fixed — allowlist |
| S3 | Medium | `where(col, '<comparator>', v)` comparator unvalidated | Fixed — pattern allowlist |
| S4 | Low | `fn()` name / `cast()` type unvalidated (developer API, same as v6) | Fixed — pattern validation |
| S5 | Info | Default `logging: console.log` prints SQL text and bind values (v6 behaviour) | Accepted for compat; document `logging: false` in production |
| S6 | Info | Error objects carry `sql` and `parameters` (v6 behaviour) — may contain PII if logged | Accepted; documented |
| S7 | Low | Unbounded `IN`/bulk sizes can exceed parameter limit → DatabaseError, no DoS beyond caller's own request | Accepted |

## Auth / secrets
No auth logic in the library. Passwords are passed to `pg` only; not logged. `sequelize.config.password` is exposed like v6.

## Dependencies
Runtime: `inflection` (no network/IO), peer `pg`. `npm audit`: 0 vulnerabilities at review time.

## MVP (M3–M5) review
See `.10x/reviews/2026-11-14-mvp-security-review.md` — no open High/Medium findings.
