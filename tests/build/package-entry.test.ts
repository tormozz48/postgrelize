import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import pkg from '../../package.json' with { type: 'json' };

const require = createRequire(import.meta.url);
const exportsMap = pkg.exports['.'];
const distUrl = (file: string): URL => new URL(`../../${file}`, import.meta.url);

describe('built package', () => {
  it.each([exportsMap.import, exportsMap.require, exportsMap.types])('emits %s', (file) => {
    expect(existsSync(distUrl(file))).toBe(true);
  });

  it('loads as ESM', async () => {
    await expect(import(distUrl(exportsMap.import).href)).resolves.toBeDefined();
  });

  it('loads as CommonJS', () => {
    expect(require(fileURLToPath(distUrl(exportsMap.require)))).toBeDefined();
  });
});
