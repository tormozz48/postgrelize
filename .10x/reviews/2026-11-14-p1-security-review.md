# Security Review — P1, 2026-11-14

| Surface | Control | Status |
|---|---|---|
| Subqueries / EXISTS / window / tuple | Compiled through the same AST + where compiler; values bound; window order directions allow-listed | OK |
| UPDATE FROM / DELETE USING aliases | Aliases quoted identifiers; sources are models or subqueries only | OK |
| MERGE VALUES source | Values bound with casts derived from attribute types (type names from definitions, enum names quoted) | OK |
| COPY | Text-format encoder escapes backslash/tab/newline/CR and array quoting; table/column names quoted; malformed data rejected by server; connection released only after the stream stops | OK |
| LISTEN / NOTIFY | Channel names quoted (`LISTEN "x"`); `pg_notify($1, $2)` bound | OK |
| SET LOCAL settings | `set_config($1, $2, true)` bound — no SQL built from setting names | OK |
| Advisory locks | Keys bound (`$1::bigint` / `hashtextextended($1, 0)`) | OK |
| Cursors | Cursor names generated (`pgz_cursor_<uuid>`), quoted; batch size validated as positive integer | OK |
| Generated column expressions | Developer-supplied expressions rendered via ADR-010 literal inlining | OK (developer API, like `literal`) |

**Verdict:** no open findings.
