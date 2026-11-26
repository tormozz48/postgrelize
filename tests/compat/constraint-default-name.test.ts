import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: default names of addConstraint', () => {
  it('names primary key, unique, check and foreign key constraints like v6', () =>
    expectSameResult('', async (lib, sequelize) => {
      const { STRING, INTEGER } = lib.DataTypes;
      const queryInterface = sequelize.getQueryInterface();
      await queryInterface.createTable('users', { name: STRING, age: INTEGER });
      await queryInterface.createTable('posts', { author: STRING, title: STRING });
      await queryInterface.addConstraint('users', { type: 'primary key', fields: ['name'] });
      await queryInterface.addConstraint('users', { type: 'unique', fields: ['age', 'name'] });
      await queryInterface.addConstraint('users', {
        type: 'check',
        fields: ['age'],
        where: { age: { [lib.Op.gt]: 0 } },
      });
      await queryInterface.addConstraint('posts', {
        type: 'foreign key',
        fields: ['author'],
        references: { table: 'users', field: 'name' },
      });
      const names = await sequelize.query(
        `SELECT conname FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
         WHERE n.nspname = current_schema() AND contype <> 'n' ORDER BY 1`,
        { type: 'SELECT' as never },
      );
      await queryInterface.removeConstraint('posts', 'posts_author_users_fk');
      return names;
    }));
});
