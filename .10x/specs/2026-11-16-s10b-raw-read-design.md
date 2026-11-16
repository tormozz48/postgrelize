# S10b — raw read gap on real PostgreSQL

Date: 2026-11-16. Follows S10 (`2026-11-15-s10-performance-design.md`), whose target of 1.2x for `findAll 10000 rows raw` was missed (stub parity 1.0x; real PostgreSQL 16: v6 16% faster).

## Method

Private PostgreSQL 16 container on its own port, `PGZ_TEST_URL` pointing at it. Both libraries in one process, alternating order, CPU time (`process.cpuUsage`). The machine was heavily loaded by other sessions (load average 20–120), so only the v6/postgrelize ratio inside one process is used; absolute µs are inflated. Besides `bench/`, a scratch script ran three variants on the same schema: postgrelize `findAll({raw: true})`, v6 `findAll({raw: true})`, and a bare `pg` `query()` with the same SQL (the floor).

## Reproduction (before)

`PGZ_BENCH_ONLY="rows raw" PGZ_BENCH_ROUNDS=9`: CPU 40.7 ms (postgrelize) vs 32.4 ms (v6) per 10 000 rows, ratio 0.80. Scratch script (31 rounds × 3 calls, two runs): median postgrelize 34.8 / 40.0 ms, v6 30.0 / 36.8 ms, bare `pg` 28.6 / 30.6 ms. Overhead above the driver floor: v6 about 1.5 ms, postgrelize about 5–6 ms. Spread (MAD) inside a run: 10–20%, so a single run cannot prove a 10% gap; the consistent sign across runs does.

## Profile (real mode, `node --cpu-prof` on `dist`)

Self time: `parseDate` (pg's own `postgres-date`, both libraries) 22%, **`RowMapper.parseOwned` 18.8%**, GC 10%, pg `parseRow` 7%, utf8 decoding 5%. No extra round trip, no BEGIN/SET, no result copy: `execute` returns the driver array. The driver cost is shared with v6; the only avoidable cost is `parseOwned`, which for every row and column did `Object.keys`, an iterator over `keys.entries()`, a `Map.get` and a keyed store, to apply parsers to two timestamp columns. In stub mode the same loop is hidden because v6 also pays for building rows there.

## Fix

`RowMapper.parseAllOwned(definition, rows)`: all rows of one statement share their columns, so the column plan is resolved once from the first row (only the parsers are kept); each row then runs just those parsers. A result with no parsers is returned untouched; a renamed column falls back to per-row `parseOwned`, so key order and values are identical. `FindOperation#raw` uses it when there are no includes and returns the driver array instead of a mapped copy. SQL, results and public API unchanged.

## Results

Real PostgreSQL 16, `findAll 10000 rows raw`, v6 CPU ÷ postgrelize CPU (above 1 = faster than v6): before 0.80; after (bench, 15 rounds) 1.05, 1.17, 1.08, and in the full-suite runs 1.35, 1.15, 1.12. Profile share of the mapper: 18.8% → 6.2%. The remaining time is the driver (`parseDate`, `parseRow`, utf8), which postgrelize cannot remove without replacing `pg` parsers (non-goal: v6 semantics).

Other cases on real PostgreSQL (three full runs, ratio): `findAll 100 rows` 1.72/1.67/1.07, `count where` 1.33/1.28/1.56, `bulkCreate 100` 1.38/1.33/1.34. The earlier `bulkCreate 100` 0.93 and `findAll 100`/`count` near parity were load noise (their code paths were not touched by this change); no regression was found.
