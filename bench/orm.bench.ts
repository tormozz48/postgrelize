// Hot-path benchmark for the performance budget. Runs through Vitest (decorators need compiling):
//   PGZ_BENCH_STUB=1 PGZ_BENCH_JSON=out.json npm run bench
// Default mode needs the test database (PGZ_TEST_URL or the docker compose default); its numbers
// are dominated by I/O. `PGZ_BENCH_STUB=1` replaces `pg` with an in-memory responder, so it measures
// the library's own overhead (query building, execution pipeline, row mapping) — the budget gate.
// Every scenario also runs on Sequelize v6 (bench/v6.bench.ts), interleaved round by round so that
// load on the machine hits both sides alike. Besides wall time per op the runner records CPU time
// (process.cpuUsage), which is far less sensitive to other processes than wall time.
//   PGZ_BENCH_ONLY=<substring>  run only matching cases; PGZ_BENCH_ROUNDS=<n> override round count
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { DataTypes, Op, Sequelize } from '../src/index.ts';
import { createScenario, type Case, type Lib, type Scenario } from './scenarios.ts';
import { installStub } from './stub.ts';
import { v6Lib } from './v6.bench.ts';

const stub = process.env['PGZ_BENCH_STUB'] === '1';
const only = process.env['PGZ_BENCH_ONLY'] ?? '';
const ROUNDS = Number(process.env['PGZ_BENCH_ROUNDS'] ?? (stub ? 25 : 7));
if (stub) {
  installStub();
}

const url =
  process.env['PGZ_TEST_URL'] ?? 'postgres://postgres:postgres@localhost:54329/postgrelize';
const pgzLib: Lib = { Sequelize, DataTypes, Op };
const libs = [
  { name: 'pgz', lib: pgzLib, schema: `bench_pgz_${process.pid}` },
  { name: 'v6', lib: v6Lib, schema: `bench_v6_${process.pid}` },
] as const;

const admin = new Sequelize(url, { logging: false });
const scenarios: Record<string, Scenario> = {};
for (const { name, lib, schema } of libs) {
  if (!stub) {
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE; CREATE SCHEMA "${schema}"`);
  }
  scenarios[name] = createScenario(lib, url, schema, stub);
  await scenarios[name].setup();
}

type Sample = Readonly<{ wall: number; cpu: number }>;
// Database mode is dominated by round trips, so fewer iterations per round are enough.
const SCALE = stub ? 1 : 0.2;
const timeRound = async ({ run, ...entry }: Case): Promise<Sample> => {
  const iterations = Math.max(3, Math.round(entry.iterations * SCALE));
  const cpuStart = process.cpuUsage();
  const start = performance.now();
  for (let index = 0; index < iterations; index += 1) {
    await run();
  }
  const wall = ((performance.now() - start) * 1000) / iterations;
  const { user, system } = process.cpuUsage(cpuStart);
  return { wall, cpu: (user + system) / iterations };
};

const median = (values: readonly number[]): number =>
  values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
const spread = (values: readonly number[]): number => {
  const mid = median(values);
  return mid === 0 ? 0 : (median(values.map((value) => Math.abs(value - mid))) / mid) * 100;
};
const summarize = (samples: readonly Sample[]) => ({
  min: Math.min(...samples.map((sample) => sample.wall)),
  median: median(samples.map((sample) => sample.wall)),
  cpu: median(samples.map((sample) => sample.cpu)),
  mad: spread(samples.map((sample) => sample.cpu)),
});

const results: Record<string, number> = {};
const detail: Record<string, unknown> = {};
const names = Object.keys(scenarios['pgz']?.cases ?? {}).filter((name) => name.includes(only));
console.log(`mode=${stub ? 'stub' : 'database'} rounds=${ROUNDS}`);
console.log(
  `${'case'.padEnd(32)} ${'pgz cpu'.padStart(9)} ${'v6 cpu'.padStart(9)} ${'v6/pgz'.padStart(7)} ${'pgz wall'.padStart(9)} ${'mad%'.padStart(5)} ${'rows/s'.padStart(10)}`,
);
for (const name of names) {
  const cases = libs.map(({ name: lib }) => scenarios[lib]?.cases[name] as Case);
  for (const entry of cases) {
    await entry.run();
  }
  const samples: Sample[][] = libs.map(() => []);
  for (let round = 0; round < ROUNDS; round += 1) {
    // Alternate which side goes first so neither one always runs on a cooled-down cache.
    const order = round % 2 === 0 ? [0, 1] : [1, 0];
    for (const side of order) {
      samples[side]?.push(await timeRound(cases[side] as Case));
    }
  }
  const [pgz, v6] = samples.map((list) => summarize(list)) as [
    ReturnType<typeof summarize>,
    ReturnType<typeof summarize>,
  ];
  const rows = cases[0]?.rows;
  const rowsPerSecond = rows === undefined ? '' : String(Math.round((rows * 1e6) / pgz.cpu));
  results[name] = stub ? pgz.min : pgz.median;
  results[`v6/${name}`] = stub ? v6.min : v6.median;
  detail[name] = { pgz, v6, ratio: v6.cpu / pgz.cpu };
  console.log(
    `${name.padEnd(32)} ${pgz.cpu.toFixed(1).padStart(9)} ${v6.cpu.toFixed(1).padStart(9)} ${(v6.cpu / pgz.cpu).toFixed(2).padStart(7)} ${pgz.min.toFixed(1).padStart(9)} ${pgz.mad.toFixed(1).padStart(5)} ${rowsPerSecond.padStart(10)}`,
  );
}

for (const { name } of libs) {
  await scenarios[name]?.sequelize.close();
  await Promise.all((scenarios[name]?.others ?? []).map((other) => other.close()));
}
if (!stub) {
  for (const { schema } of libs) {
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
  }
}
await admin.close();
const out = process.env['PGZ_BENCH_JSON'];
if (out !== undefined && out !== '') {
  writeFileSync(out, `${JSON.stringify({ ...results, details: detail }, null, 2)}\n`);
}
