import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const tsc = fileURLToPath(new URL('../../node_modules/typescript/bin/tsc', import.meta.url));
const project = fileURLToPath(new URL('fixtures/tsconfig.json', import.meta.url));

describe('published declarations', () => {
  // The mixin-built Model is emitted structurally; a strict consumer (skipLibCheck: false) must compile.
  it('type-check in a strict consumer project', () => {
    expect(() =>
      execFileSync(process.execPath, [tsc, '-p', project], { encoding: 'utf8', stdio: 'pipe' }),
    ).not.toThrow();
  }, 120_000);
});
