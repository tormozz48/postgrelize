# Security Review — MVP (M3–M5), 2026-11-14

| Area | Finding | Status |
|---|---|---|
| Hooks / validators | Run user code by design; no SQL built from their return values | OK |
| Scopes | Scope options flow through the same where/order compilers and allowlists as query options | OK |
| Include | Aliases come from association definitions and are quoted; include `where`/`order` compiled with bound params / allowlists | OK |
| DDL (ADR-010) | Literals rendered by `escapeLiteral` (quotes doubled, `E''` for backslashes, NUL rejected, non-finite numbers rejected); identifiers quoted; index method / operator class / referential actions allow-listed | OK — unit tests with hostile strings |
| QueryInterface bulk* | DML via bound parameters | OK |
| `beforeConnect` | Receives a copy of config incl. password; only the password is applied | OK |
| Logging | `logging: console.log` default prints SQL and bind values (v6 behaviour) | Accepted; README recommends `logging: false` |
| Dependencies | runtime: `inflection`, `validator` (both used by v6); `npm audit --omit=dev`: 0 vulnerabilities | OK |

**Verdict:** no open High/Medium findings.
