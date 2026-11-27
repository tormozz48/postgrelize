import { describe, expect, it } from 'vitest';
import { Sequelize } from '../../src/index.ts';
import { testDatabaseUrl } from '../support/db-url.ts';

describe('pool acquire hooks', () => {
  it('returns the connection to the pool when afterPoolAcquire throws', async () => {
    const sequelize = new Sequelize(testDatabaseUrl(), { logging: false, pool: { max: 1 } });
    try {
      sequelize.addHook('afterPoolAcquire', () => {
        throw new Error('rejected');
      });
      await expect(sequelize.query('SELECT 1')).rejects.toThrow('rejected');
      sequelize.removeHook('afterPoolAcquire');
      await expect(sequelize.query('SELECT 1')).resolves.toBeDefined();
    } finally {
      await sequelize.close();
    }
  });
});
