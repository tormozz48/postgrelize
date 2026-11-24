import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { generateCalls } from '../support/type-call-generator.ts';

const execFileAsync = promisify(execFile);
const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));
const tsc = here('../../node_modules/typescript/bin/tsc');

const FLAG_SETS: readonly (readonly string[])[] = [
  [],
  ['--exactOptionalPropertyTypes'],
  ['--strictNullChecks', 'false'],
];

const failingLines = async (
  dir: string,
  library: 'v6' | 'postgrelize',
  flags: readonly string[],
): Promise<Set<number>> => {
  const target =
    library === 'v6'
      ? here('../../node_modules/sequelize/types/index.d.ts')
      : here('../../src/index.ts');
  const config = join(dir, `tsconfig.${library}.json`);
  writeFileSync(
    config,
    JSON.stringify({
      extends: here('./type-parity/tsconfig.base.json'),
      compilerOptions: {
        paths: { '@orm': [target] },
        typeRoots: [here('../../node_modules/@types')],
        baseUrl: undefined,
      },
      include: [join(dir, 'generated.ts')],
    }),
  );
  const output = await execFileAsync(
    process.execPath,
    [tsc, '-p', config, '--pretty', 'false', ...flags],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  ).then(
    () => '',
    (error: { stdout?: string }) => String(error.stdout ?? ''),
  );
  const lines = [...output.matchAll(/generated\.ts\((\d+),\d+\): error/g)].map((m) => Number(m[1]));
  return new Set(lines);
};

describe('generated API calls compile on postgrelize wherever they compile on Sequelize v6', () => {
  for (const flags of FLAG_SETS) {
    it(`flags: ${flags.join(' ') || 'default'}`, async () => {
      const { source, statements } = generateCalls();
      const dir = mkdtempSync(join(tmpdir(), 'pgz-generated-'));
      try {
        writeFileSync(join(dir, 'generated.ts'), source);
        const [theirs, ours] = await Promise.all([
          failingLines(dir, 'v6', flags),
          failingLines(dir, 'postgrelize', flags),
        ]);
        const onlyOurs = statements.filter(
          (statement) => ours.has(statement.id) && !theirs.has(statement.id),
        );
        expect(onlyOurs.map((statement) => statement.text)).toEqual([]);
        expect(statements.length - theirs.size).toBeGreaterThan(100);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }, 300_000);
  }
});
