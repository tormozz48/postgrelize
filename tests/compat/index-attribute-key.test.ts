import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: index fields given by attribute', () => {
  it('creates the index like v6', () =>
    expectSameResult('', async (lib, sequelize) => {
      const { INTEGER, STRING } = lib.DataTypes;
      const fields = ['a', { attribute: 'e', order: 'DESC' }];
      const Item = sequelize.define('item', { a: INTEGER, e: STRING }, {
        indexes: [{ name: 'item_ix', unique: true, fields }],
      } as never);
      await Item.sync();
      await sequelize.getQueryInterface().addIndex('items', [{ attribute: 'e' } as never]);
      const [indexes] = await sequelize.query(
        `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = current_schema() ORDER BY 1`,
      );
      return indexes.map((index) => {
        const { indexname, indexdef } = index as { indexname: string; indexdef: string };
        return [indexname, indexdef.split(' USING ')[1]];
      });
    }));
});
