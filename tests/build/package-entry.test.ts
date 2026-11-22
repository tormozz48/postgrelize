import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type * as Postgrelize from '../../src/index.ts';
import pkg from '../../package.json' with { type: 'json' };

const require = createRequire(import.meta.url);
const distUrl = (file: string): URL => new URL(`../../${file}`, import.meta.url);

describe.each([['.', pkg.exports['.'], 'Sequelize']])(
  'built package entry %s',
  (_entry, exportsMap, member) => {
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
  },
);

describe('built package default export and constructable CommonJS entry (ADR-034)', () => {
  const cjsPath = fileURLToPath(distUrl(pkg.exports['.'].require));
  const url = 'postgres://u:p@localhost:1/db';

  it('require() is the Sequelize class with every named export as a static', () => {
    const entry = require(cjsPath) as typeof Postgrelize.Sequelize & Record<string, unknown>;
    const core = require(cjsPath.replace(/index\.cjs$/, 'index.core.cjs')) as Record<
      string,
      unknown
    >;
    expect(typeof entry).toBe('function');
    expect(entry.Sequelize).toBe(entry);
    expect(entry.default).toBe(entry);
    const different = Object.keys(core).filter(
      (key) => !['default', '__esModule'].includes(key) && entry[key] !== core[key],
    );
    expect(different).toEqual([]);
    expect(new entry(url, { logging: false })).toBeInstanceOf(core.Sequelize as never);
  });

  it('replaces only the four association statics by a named export (they are the decorators)', async () => {
    const esm = (await import(distUrl(pkg.exports['.'].import).href)) as Record<string, unknown>;
    const statics = esm.Sequelize as Record<string, unknown>;
    const replaced = Object.keys(esm).filter(
      (key) => key !== 'default' && key in statics && statics[key] !== esm[key],
    );
    expect(replaced.toSorted()).toEqual(['BelongsTo', 'BelongsToMany', 'HasMany', 'HasOne']);
  });

  it('exposes the default export in ESM next to the named exports', async () => {
    const loaded = (await import(distUrl(pkg.exports['.'].import).href)) as Record<string, unknown>;
    expect(loaded.default).toBe(loaded.Sequelize);
  });

  it('keeps require(...).Sequelize working', () => {
    const entry = require(cjsPath) as { Sequelize: new (uri: string, options: object) => unknown };
    expect(new entry.Sequelize(url, { logging: false })).toBeDefined();
  });
});

describe('built package decorators', () => {
  it('work without compiler support for decorators (called as functions)', async () => {
    const { Column, DataTypes, Model, PrimaryKey, Sequelize, Table } = (await import(
      distUrl(pkg.exports['.'].import).href
    )) as typeof Postgrelize;
    class Item extends Model {}
    Table({ tableName: 'items' })(Item);
    Column(DataTypes.INTEGER)(Item.prototype, 'id');
    PrimaryKey(Item.prototype, 'id');
    const sequelize = new Sequelize('postgres://u:p@localhost:1/db', { logging: false });
    sequelize.addModels([Item]);
    expect(Item.rawAttributes.id?.primaryKey).toBe(true);
    expect(Item.tableName).toBe('items');
  });
});
