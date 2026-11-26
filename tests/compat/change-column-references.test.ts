import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: changeColumn with references', () => {
  it('adds the foreign key and leaves the column otherwise', () =>
    expectSameResult('', async (lib, sequelize) => {
      const { STRING, INTEGER } = lib.DataTypes;
      const queryInterface = sequelize.getQueryInterface();
      await queryInterface.createTable('levels', {
        id: { type: INTEGER, primaryKey: true },
      });
      await queryInterface.createTable('users', {
        name: STRING,
        level_id: { type: INTEGER, allowNull: false },
      });
      await queryInterface.changeColumn('users', 'level_id', {
        type: INTEGER,
        references: { model: 'levels', key: 'id' },
        onDelete: 'cascade',
        onUpdate: 'set null',
      });
      const nullable = await sequelize.query(
        `SELECT is_nullable FROM information_schema.columns
         WHERE table_schema = current_schema() AND column_name = 'level_id'`,
        { type: 'SELECT' as never },
      );
      const rules = await sequelize.query(
        `SELECT delete_rule, update_rule FROM information_schema.referential_constraints
         WHERE constraint_schema = current_schema()`,
        { type: 'SELECT' as never },
      );
      return [nullable, rules];
    }));
});
