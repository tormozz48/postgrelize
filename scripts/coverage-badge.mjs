// Writes coverage/badge.json (shields.io endpoint format) from coverage/coverage-summary.json.
import { readFile, writeFile } from 'node:fs/promises';

const summary = JSON.parse(await readFile('coverage/coverage-summary.json', 'utf8'));
const percent = summary.total.lines.pct;
const color =
  percent >= 90 ? 'brightgreen' : percent >= 80 ? 'green' : percent >= 70 ? 'yellow' : 'red';
const badge = { schemaVersion: 1, label: 'coverage', message: `${percent.toFixed(1)}%`, color };
await writeFile('coverage/badge.json', `${JSON.stringify(badge)}\n`);
console.log(`coverage badge: ${badge.message}`);
