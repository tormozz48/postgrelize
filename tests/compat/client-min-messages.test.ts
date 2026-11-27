import { describe, it } from 'vitest';
import { expectSameResult, type Lib } from '../support/compat.ts';
import { testDatabaseUrl } from '../support/db-url.ts';

const level = async (lib: Lib, options: object): Promise<unknown> => {
  const sequelize = new lib.Sequelize(testDatabaseUrl(), { logging: false, ...options });
  try {
    const [rows] = await sequelize.query('SHOW client_min_messages');
    return rows;
  } finally {
    await sequelize.close();
  }
};

describe('compat: client_min_messages', () => {
  it.each([
    ['the default', {}],
    ['dialectOptions', { dialectOptions: { clientMinMessages: 'ERROR' } }],
    ['the deprecated option', { clientMinMessages: 'notice' }],
    ['ignore', { dialectOptions: { clientMinMessages: 'IGNORE' } }],
    ['false', { clientMinMessages: false }],
  ])('follows %s', async (_name, options) => {
    await expectSameResult('', (lib) => level(lib, options));
  });
});
