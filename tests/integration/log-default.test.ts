import { describe, expect, it, vi } from 'vitest';
import { Sequelize } from '../../src/index.ts';
import { testDatabaseUrl } from '../support/db-url.ts';

describe('sequelize.log', () => {
  it('writes to console.log when no logging option is given, like v6', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const sequelize = new Sequelize(testDatabaseUrl());
    try {
      sequelize.log('hi', 1);
      expect(spy).toHaveBeenCalledWith('hi', 1);
    } finally {
      spy.mockRestore();
      await sequelize.close();
    }
  });
});
