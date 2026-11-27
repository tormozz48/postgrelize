import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: two models mapped to one table', () => {
  it('syncs only the last one', () =>
    expectSameResult('', async (lib, sequelize) => {
      const { STRING } = lib.DataTypes;
      const options = { timestamps: false, tableName: 'items' };
      sequelize.define('first', { a: STRING }, options);
      sequelize.define('second', { b: STRING }, options);
      await sequelize.sync();
      const [columns] = await sequelize.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = current_schema() ORDER BY 1`,
      );
      return columns;
    }));
});
