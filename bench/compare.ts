// Compares stub-mode benchmark results with bench/baseline.json against the S4 budget agreed with
// the owner: the gated cases (row-heavy operations) at most 10% slower each. Single-statement cases
// are reported with their absolute overhead: Effect adds a fixed ~1 µs per run, which is a large
// share of a stubbed 3–10 µs call but negligible next to a real round trip.
//   node bench/compare.ts <result.json> [<result.json> ...]
// PGZ_BENCH_BASELINE=<file> compares with another reference (e.g. bench/reference-s10.json).
import { readFileSync } from 'node:fs';

type Results = Readonly<Record<string, number>>;
const read = (path: string): Results => JSON.parse(readFileSync(path, 'utf8')) as Results;

const baseline = read(
  process.env['PGZ_BENCH_BASELINE'] ?? new URL('baseline.json', import.meta.url).pathname,
);
const runs = process.argv.slice(2).map(read);
if (runs.length === 0) {
  throw new Error('pass at least one result file');
}
const best = Object.fromEntries(
  Object.keys(baseline).map((name) => [
    name,
    Math.min(...runs.map((run) => run[name] ?? Infinity)),
  ]),
);
const ratios = Object.entries(baseline).map(([name, before]) => {
  const ratio = (best[name] ?? Infinity) / before;
  console.log(
    `${name.padEnd(24)} ${before.toFixed(1).padStart(8)} → ${(best[name] ?? NaN).toFixed(1).padStart(8)} µs  ${((ratio - 1) * 100).toFixed(1).padStart(6)}%`,
  );
  return ratio;
});
const GATED = ['findAll 100 rows', 'create', 'bulkCreate 100', 'insert onConflict 50'];
const geomean = Math.exp(ratios.reduce((sum, ratio) => sum + Math.log(ratio), 0) / ratios.length);
console.log(`geometric mean (all cases, informational) ${((geomean - 1) * 100).toFixed(1)}%`);
const over = GATED.filter((name) => (best[name] ?? Infinity) / (baseline[name] ?? 0) > 1.1);
if (over.length > 0) {
  console.error(`over budget: ${over.join(', ')}`);
  console.error('performance budget exceeded');
  process.exitCode = 1;
}

// Informational: every case (also those without a baseline) against Sequelize v6. CPU time per op
// (median over the interleaved rounds of each run), then the median over the result files; the
// ratio is v6 / postgrelize, so a value above 1 means postgrelize is faster. `spread` is the
// min–max range of that ratio across the files, to tell a real change from machine noise.
type Side = Readonly<{ cpu: number }>;
type Detail = Readonly<Record<string, Readonly<{ pgz: Side; v6: Side; ratio: number }>>>;
const readDetail = (path: string): Detail =>
  (JSON.parse(readFileSync(path, 'utf8')) as { details?: Detail }).details ?? {};
const median = (values: readonly number[]): number =>
  values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
const details = process.argv.slice(2).map(readDetail);
const names = [...new Set(details.flatMap((detail) => Object.keys(detail)))];
if (names.length > 0) {
  console.log(
    `\n${'case'.padEnd(32)} ${'pgz µs'.padStart(10)} ${'v6 µs'.padStart(10)} ${'v6/pgz'.padStart(7)}  spread`,
  );
  for (const name of names) {
    const found = details.map((detail) => detail[name]).filter((entry) => entry !== undefined);
    const caseRatios = found.map((entry) => entry.ratio);
    console.log(
      `${name.padEnd(32)} ${median(found.map((entry) => entry.pgz.cpu))
        .toFixed(1)
        .padStart(10)} ${median(found.map((entry) => entry.v6.cpu))
        .toFixed(1)
        .padStart(
          10,
        )} ${median(caseRatios).toFixed(2).padStart(7)}  ${Math.min(...caseRatios).toFixed(2)}–${Math.max(...caseRatios).toFixed(2)}`,
    );
  }
}
