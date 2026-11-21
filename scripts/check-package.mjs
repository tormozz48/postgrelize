import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const errors = [];
const expect = (ok, message) => {
  if (!ok) errors.push(message);
};

expect(pkg.name === 'postgrelize', `name must be "postgrelize", got "${pkg.name}"`);
expect(pkg.license === 'MIT', 'license must be MIT');
expect(pkg.publishConfig?.access === 'public', 'publishConfig.access must be "public"');
expect(
  pkg.publishConfig?.registry === 'https://registry.npmjs.org/',
  'publishConfig.registry must be https://registry.npmjs.org/',
);
for (const field of ['description', 'homepage', 'bugs', 'repository', 'engines']) {
  expect(pkg[field], `package.json needs "${field}"`);
}
expect(pkg.keywords?.length > 0, 'package.json needs keywords');
expect(
  !pkg.dependencies || !Object.keys(pkg.dependencies).includes('pg'),
  'pg must stay a peer dependency',
);

const raw = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
  encoding: 'utf8',
});
const report = JSON.parse(raw);
const entry = Array.isArray(report) ? report[0] : Object.values(report)[0];
const files = entry.files.map((file) => file.path);

for (const required of [
  'package.json',
  'README.md',
  'LICENSE',
  'llm/USAGE.md',
  'skills/postgrelize/SKILL.md',
  'dist/index.js',
  'dist/index.cjs',
  'dist/index.d.ts',
]) {
  expect(files.includes(required), `tarball is missing ${required}`);
}
const allowed = /^(dist|llm|skills)\/|^(package\.json|README\.md|LICENSE)$/;
for (const file of files) {
  expect(allowed.test(file), `unexpected file in tarball: ${file}`);
}

if (errors.length > 0) {
  console.error(errors.map((message) => `::error::${message}`).join('\n'));
  process.exit(1);
}
console.log(`${entry.id}: ${files.length} files, ${entry.size} bytes packed, checks passed`);
