import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import pkg from '../../package.json' with { type: 'json' };

const require = createRequire(import.meta.url);
const distUrl = (file: string): URL => new URL(`../../${file}`, import.meta.url);

describe.each([
  ['.', pkg.exports['.'], 'Sequelize'],
  ['./effect', pkg.exports['./effect'], 'transaction'],
])('built package entry %s', (_entry, exportsMap, member) => {
  it.each([exportsMap.import, exportsMap.require, exportsMap.types])('emits %s', (file) => {
    expect(existsSync(distUrl(file))).toBe(true);
  });

  it('loads as ESM', async () => {
    const loaded = (await import(distUrl(exportsMap.import).href)) as Record<string, unknown>;
    expect(loaded[member]).toBeDefined();
  });

  it('loads as CommonJS', () => {
    const loaded = require(fileURLToPath(distUrl(exportsMap.require))) as Record<string, unknown>;
    expect(loaded[member]).toBeDefined();
  });
});
