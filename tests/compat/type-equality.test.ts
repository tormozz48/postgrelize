import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

// tests/compat/type-equality/acceptance.ts checks, for `WhereOptions` and the values of `Model.update`, that every
// sample value Sequelize v6 accepts is also accepted by postgrelize (`Missed<…>` must be `never`).
it('postgrelize accepts every sample value that the v6 types accept', () => {
  let output = '';
  try {
    execFileSync(
      process.execPath,
      [
        here('../../node_modules/typescript/bin/tsc'),
        '-p',
        here('type-equality/tsconfig.json'),
        '--pretty',
        'false',
      ],
      { encoding: 'utf8', stdio: 'pipe' },
    );
  } catch (error) {
    output = String((error as { stdout?: string }).stdout ?? error);
  }
  expect(
    output.split('\n').filter((line) => line.startsWith('tests/compat/type-equality/')),
  ).toEqual([]);
}, 240_000);
