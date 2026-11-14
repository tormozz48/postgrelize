// Hot-path benchmark for the S4 performance budget. Usage:
//   node --experimental-strip-types bench/orm.bench.ts [--stub] [--json out.json]
// Default mode needs the test database (PGZ_TEST_URL or the docker compose default); its numbers
// are dominated by I/O. `--stub` replaces the `pg` pool with an in-memory responder, so it measures
// the ORM's own overhead (query building, execution pipeline, row mapping) — the budget gate.
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { Pool } from 'pg';
import { DataTypes, Op, Sequelize } from '../src/index.ts';

const stub = process.argv.includes('--stub');

type Row = Record<string, unknown>;
const row = (index: number): Row => ({
  id: index + 1,
  sku: `s${index}`,
  qty: index,
  meta: { index },
  createdAt: new Date(0),
  updatedAt: new Date(0),
  __pgz_inserted: true,
});
const respond = (
  text: string,
  values: readonly unknown[],
): Readonly<{ rows: Row[]; rowCount: number }> => {
  if (text.startsWith('SELECT count')) {
    return { rows: [{ count: '990' }], rowCount: 1 };
  }
  if (text.startsWith('SELECT')) {
    const bound = /LIMIT \$(\d+)/.exec(text)?.[1];
    const limit = bound === undefined ? 1 : Number(values[Number(bound) - 1]);
    return { rows: Array.from({ length: limit }, (_, index) => row(index)), rowCount: limit };
  }
  if (text.startsWith('INSERT')) {
    const count = text.split('), (').length;
    return { rows: Array.from({ length: count }, (_, index) => row(index)), rowCount: count };
  }
  return { rows: [], rowCount: 1 };
};
if (stub) {
  const client = {
    query: async (query: string | { text: string; values?: unknown[] }) =>
      typeof query === 'string' ? respond(query, []) : respond(query.text, query.values ?? []),
    release: () => undefined,
  };
  (Pool.prototype as unknown as { connect: () => Promise<unknown> }).connect = async () => client;
}

const url =
  process.env['PGZ_TEST_URL'] ?? 'postgres://postgres:postgres@localhost:54329/postgrelize';
const schema = `bench_${process.pid}`;
const ROUNDS = stub ? 25 : 7;

const admin = new Sequelize(url, { logging: false });
if (!stub) {
  await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE; CREATE SCHEMA "${schema}"`);
}
const sequelize = new Sequelize(url, {
  logging: false,
  pool: { max: 5 },
  dialectOptions: { options: `-c search_path=${schema}` },
});
const Item = sequelize.define('Item', {
  sku: { type: DataTypes.STRING, unique: true },
  qty: DataTypes.INTEGER,
  meta: DataTypes.JSONB,
});
if (!stub) {
  await sequelize.sync();
  await Item.bulkCreate(
    Array.from({ length: 1000 }, (_, index) => ({ sku: `s${index}`, qty: index, meta: { index } })),
  );
}

let counter = 0;
const cases: Readonly<
  Record<string, Readonly<{ iterations: number; run: () => Promise<unknown> }>>
> = {
  'findAll 100 rows': {
    iterations: 200,
    run: () => Item.findAll({ limit: 100, order: [['id', 'ASC']] }),
  },
  findByPk: { iterations: 1000, run: () => Item.findByPk(500) },
  'count where': { iterations: 1000, run: () => Item.count({ where: { qty: { [Op.gte]: 10 } } }) },
  create: { iterations: 500, run: () => Item.create({ sku: `c${(counter += 1)}`, qty: 1 }) },
  'bulkCreate 100': {
    iterations: 50,
    run: () =>
      Item.bulkCreate(Array.from({ length: 100 }, () => ({ sku: `b${(counter += 1)}`, qty: 2 }))),
  },
  'insert onConflict 50': {
    iterations: 100,
    run: () =>
      Item.insert(
        Array.from({ length: 50 }, (_, index) => ({ sku: `s${index}`, qty: index })),
        { onConflict: { target: ['sku'], action: { update: ['qty'] } } },
      ),
  },
  'transaction + update': {
    iterations: 300,
    run: () =>
      sequelize.transaction((transaction) =>
        Item.update({ qty: 3 }, { where: { sku: 's1' }, transaction }),
      ),
  },
};

const median = (values: readonly number[]): number =>
  values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

const results: Record<string, number> = {};
for (const [name, { iterations, run }] of Object.entries(cases)) {
  await run();
  const rounds: number[] = [];
  for (let round = 0; round < ROUNDS; round += 1) {
    const start = performance.now();
    for (let index = 0; index < iterations; index += 1) {
      await run();
    }
    rounds.push(((performance.now() - start) * 1000) / iterations);
  }
  // Best-of-N for the CPU-bound stub mode (least affected by load and GC), median for I/O mode.
  results[name] = stub ? Math.min(...rounds) : median(rounds);
  console.log(`${name.padEnd(24)} ${results[name].toFixed(1).padStart(8)} µs/op`);
}

await sequelize.close();
if (!stub) {
  await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
}
await admin.close();
const out = process.argv.indexOf('--json');
if (out !== -1 && process.argv[out + 1] !== undefined) {
  writeFileSync(process.argv[out + 1] as string, `${JSON.stringify(results, null, 2)}\n`);
}
