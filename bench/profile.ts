// CPU profile of one benchmark case on the built package (stub mode, no I/O):
//   npm run build && node --cpu-prof --cpu-prof-dir=/tmp/prof bench/profile.ts "findAll 100 rows" [seconds]
//   node bench/profile-summary.ts /tmp/prof/<file>.cpuprofile
// Runs on `dist` because decorators need compiling and Node cannot load `src` directly.
import { DataTypes, Op, Sequelize } from '../dist/index.js';
import { createScenario } from './scenarios.ts';
import { installStub } from './stub.ts';

installStub();
const [name = 'findAll 100 rows', seconds = '8'] = process.argv.slice(2);
const scenario = createScenario(
  { Sequelize, DataTypes, Op },
  'postgres://u:p@localhost/db',
  's',
  true,
);
const entry = scenario.cases[name];
if (entry === undefined) {
  throw new Error(`unknown case ${name}`);
}
await entry.run();
const end = Date.now() + Number(seconds) * 1000;
let count = 0;
while (Date.now() < end) {
  for (let index = 0; index < entry.iterations; index += 1) {
    await entry.run();
  }
  count += entry.iterations;
}
console.log(`${name}: ${count} ops`);
await scenario.sequelize.close();
