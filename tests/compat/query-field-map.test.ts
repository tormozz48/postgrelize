import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: fieldMap option of sequelize.query', () => {
  it('renames the columns of SELECT rows', () =>
    expectSameResult('', async (_lib, sequelize) => {
      const sql = "select 'john' as user_name, 'j@x' as email_address, 1 as id";
      const options = {
        type: 'SELECT' as never,
        fieldMap: { user_name: 'name', email_address: 'email_address', missing: 'other' },
      };
      return [
        await sequelize.query(sql, options),
        await sequelize.query(sql, { ...options, plain: true }),
        await sequelize.query(sql, { ...options, raw: true }),
      ];
    }));
});
