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
