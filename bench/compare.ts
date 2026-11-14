// Compares a stub-mode benchmark result with bench/baseline.json against the S4 budget:
// geometric mean of per-case ratios <= 1.10 and no single case above 1.20.
//   node --experimental-strip-types bench/compare.ts <result.json> [<result.json> ...]
import { readFileSync } from 'node:fs';

type Results = Readonly<Record<string, number>>;
const read = (path: string): Results => JSON.parse(readFileSync(path, 'utf8')) as Results;

const baseline = read(new URL('baseline.json', import.meta.url).pathname);
const runs = process.argv.slice(2).map(read);
if (runs.length === 0) {
  throw new Error('pass at least one result file');
}
const best = Object.fromEntries(
  Object.keys(baseline).map((name) => [name, Math.min(...runs.map((run) => run[name] ?? Infinity))]),
);
const ratios = Object.entries(baseline).map(([name, before]) => {
  const ratio = (best[name] ?? Infinity) / before;
  console.log(`${name.padEnd(24)} ${before.toFixed(1).padStart(8)} → ${(best[name] ?? NaN).toFixed(1).padStart(8)} µs  ${((ratio - 1) * 100).toFixed(1).padStart(6)}%`);
  return ratio;
});
const geomean = Math.exp(ratios.reduce((sum, ratio) => sum + Math.log(ratio), 0) / ratios.length);
console.log(`geometric mean ${((geomean - 1) * 100).toFixed(1)}%`);
if (geomean > 1.1 || ratios.some((ratio) => ratio > 1.2)) {
  console.error('performance budget exceeded');
  process.exitCode = 1;
}
