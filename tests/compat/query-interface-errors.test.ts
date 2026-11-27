import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

const message = (call: () => Promise<unknown>) =>
  call().then(
    () => 'resolved',
    (error: Error) => error.message,
  );

describe('compat: QueryInterface argument errors', () => {
  it('reports the v6 messages', () =>
    expectSameResult('CREATE TABLE users (id int)', async (_lib, sequelize) => {
      const queryInterface = sequelize.getQueryInterface();
      const [rows] = await sequelize.query('SELECT current_schema() AS name');
      const options = { schema: (rows[0] as { name: string }).name } as never;
      return [
        await message(() =>
          queryInterface.addColumn('users', 'level' as never, undefined as never),
        ),
        await message(() => queryInterface.addConstraint('users', { fields: ['id'] } as never)),
        await message(() => queryInterface.renameColumn('users', 'email', 'mail', options)),
        await message(() => queryInterface.describeTable('missing')),
      ];
    }));
});
