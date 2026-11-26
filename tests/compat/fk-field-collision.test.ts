import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: foreign key named like the column of an attribute', () => {
  it('creates the column once', () =>
    expectSameResult('', async (lib, sequelize) => {
      const { STRING } = lib.DataTypes;
      const options = { timestamps: false };
      const User = sequelize.define('user', {}, options);
      const Visit = sequelize.define(
        'visit',
        { userId: { type: STRING, field: 'user_id' } },
        options,
      );
      User.hasMany(Visit, { foreignKey: 'user_id' });
      await sequelize.sync();
      const [columns] = await sequelize.query(
        `SELECT column_name, data_type FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = 'visits' ORDER BY 1`,
      );
      const [keys] = await sequelize.query(
        `SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint
         WHERE contype = 'f' AND connamespace = current_schema()::regnamespace`,
      );
      return [columns, keys];
    }));
});
