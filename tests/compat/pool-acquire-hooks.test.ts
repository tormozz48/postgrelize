import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

type Hooked = {
  addHook: (type: string, hook: (...args: unknown[]) => unknown) => void;
  beforePoolAcquire: (hook: () => unknown) => void;
};

describe('compat: pool acquire hooks', () => {
  it('runs them around each acquisition with the connection', () =>
    expectSameResult('', async (_lib, sequelize) => {
      await sequelize.authenticate();
      const calls: unknown[] = [];
      const hooked = sequelize as unknown as Hooked;
      hooked.beforePoolAcquire(() => calls.push('before'));
      hooked.addHook('afterPoolAcquire', (connection) =>
        calls.push(['after', typeof (connection as { query?: unknown }).query]),
      );
      await sequelize.authenticate();
      await sequelize.transaction(async (transaction) => {
        await sequelize.query('SELECT 1', { transaction });
      });
      return calls;
    }));

  it('rejects with the error of beforePoolAcquire and keeps the pool usable', () =>
    expectSameResult('', async (_lib, sequelize) => {
      await sequelize.authenticate();
      let fail = true;
      (sequelize as unknown as Hooked).addHook('beforePoolAcquire', () => {
        if (fail) {
          throw new TypeError('not now');
        }
      });
      const message = await sequelize.query('SELECT 1').catch((error: Error) => error.message);
      fail = false;
      const [rows] = await sequelize.query('SELECT 1 AS one');
      return [message, rows];
    }));
});
