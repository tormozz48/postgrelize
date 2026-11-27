import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

type Factory = (options: object) => { toString(): string };

describe('compat: data types given an options object', () => {
  it('creates the same columns', () =>
    expectSameResult('', async (lib, sequelize) => {
      const types = lib.DataTypes as unknown as Record<string, Factory>;
      const cases: readonly (readonly [string, object])[] = [
        ['STRING', { length: 12 }],
        ['STRING', {}],
        ['CHAR', { length: 3 }],
        ['TEXT', { length: 'tiny' }],
        ['BLOB', { length: 'medium' }],
        ['DECIMAL', { precision: 10, scale: 2 }],
        ['DECIMAL', { precision: 10 }],
        ['FLOAT', { length: 11 }],
        ['REAL', { length: 11 }],
        ['DOUBLE', { length: 11 }],
        ['INTEGER', { length: 11 }],
      ];
      const attributes = Object.fromEntries(
        cases.map(([name, options], index) => [`c${index}`, types[name]!(options)]),
      );
      await sequelize.define('item', attributes as never, { timestamps: false }).sync();
      const [columns] = await sequelize.query(
        `SELECT column_name, data_type, character_maximum_length, numeric_precision, numeric_scale
         FROM information_schema.columns
         WHERE table_schema = current_schema() ORDER BY ordinal_position`,
      );
      return columns;
    }));
});
