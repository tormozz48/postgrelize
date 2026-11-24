// Compiles a Sequelize v6 consumer project twice, once against the v6 declarations and once with
// `sequelize` mapped to postgrelize, and lists the errors that only the postgrelize build reports.
// Usage: npm run types:consumer -- <path/to/tsconfig.json> [--flag value ...]
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tsc = join(root, 'node_modules/typescript/bin/tsc');
const [project, ...flags] = process.argv.slice(2);
if (project === undefined) {
  throw new Error('usage: npm run types:consumer -- <tsconfig.json> [tsc flags]');
}
const config = resolve(project);

// errors inside postgrelize's own sources (compiled with the consumer's flags) are not consumer errors
const isOwnSource = (line: string): boolean =>
  resolve(line.split('(')[0] ?? '').startsWith(join(root, 'src'));

const compile = (target: string): string[] => {
  const dir = mkdtempSync(join(tmpdir(), 'pgz-consumer-'));
  const file = join(dir, 'tsconfig.json');
  writeFileSync(
    file,
    JSON.stringify({
      extends: config,
      compilerOptions: {
        noEmit: true,
        allowImportingTsExtensions: true,
        paths: { sequelize: [target] },
      },
    }),
  );
  try {
    execFileSync(process.execPath, [tsc, '-p', file, '--pretty', 'false', ...flags], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return [];
  } catch (error) {
    return String((error as { stdout?: string }).stdout ?? error)
      .split('\n')
      .filter((line) => /: error TS\d+/.test(line) && !isOwnSource(line));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const key = (line: string): string => line.replace(/^(.*?\(\d+),\d+\): error (TS\d+).*$/, '$1 $2');
const theirs = new Set(compile(join(root, 'node_modules/sequelize/types/index.d.ts')).map(key));
const ours = compile(join(root, 'src/index.ts'));
const extra = ours.filter((line) => !theirs.has(key(line)));

console.log(
  `v6 errors: ${theirs.size}, postgrelize errors: ${ours.length}, only postgrelize: ${extra.length}`,
);
extra.forEach((line) => console.log(line));
process.exitCode = extra.length === 0 ? 0 : 1;
