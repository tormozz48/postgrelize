import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: addIndex with literal() and fn() fields', () => {
  it('creates the same indexes', () =>
    expectSameResult('CREATE TABLE people (name text)', async (lib, sequelize) => {
      const queryInterface = sequelize.getQueryInterface();
      await queryInterface.addIndex('people', [lib.fn('lower', lib.col('name'))], {
        name: 'people_lower',
      });
      await queryInterface.addIndex('people', [lib.literal(`(coalesce(name, 'x'))`)], {
        name: 'people_literal',
      });
      await queryInterface.addIndex('people', { fields: [lib.col('name')], name: 'people_col' });
      const [rows] = await sequelize.query(
        `SELECT indexname, regexp_replace(indexdef, ' ON [^ ]+ ', ' ') AS def FROM pg_indexes
         WHERE schemaname = current_schema() ORDER BY indexname`,
      );
      return rows;
    }));
});
