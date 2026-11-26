import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: uniqueKeys of createTable', () => {
  it('creates composite unique constraints', () =>
    expectSameResult('', async (lib, sequelize) => {
      const { STRING, INTEGER } = lib.DataTypes;
      await sequelize
        .getQueryInterface()
        .createTable(
          'things',
          { id: { type: INTEGER, primaryKey: true }, name: STRING, email: STRING },
          {
            uniqueKeys: { one: { fields: ['name', 'email'] }, two: { fields: ['email'] } },
          } as never,
        );
      return sequelize.query(
        `SELECT indexname FROM pg_indexes WHERE schemaname = current_schema()
         AND tablename = 'things' ORDER BY 1`,
        { type: 'SELECT' as never },
      );
    }));
});
