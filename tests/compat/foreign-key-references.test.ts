import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

type Reference = Record<string, string>;

// the schema differs between the two runs; v6 represents Deferrable values as functions
const portable = (reference: Reference): Reference =>
  Object.fromEntries(
    Object.entries(reference).map(([key, value]) => [
      key,
      ['constraintName', 'deferrable'].includes(key) || key.endsWith('Schema') ? 'varies' : value,
    ]),
  );

describe('compat: getForeignKeyReferencesForTable', () => {
  it('returns every field of v6', () =>
    expectSameResult('', async (_lib, sequelize) => {
      const User = sequelize.define('user', {});
      const Host = sequelize.define('host', {});
      Host.belongsTo(User, { foreignKey: 'owner' });
      await sequelize.sync({ force: true });
      const queryInterface = sequelize.getQueryInterface();
      const found = (await queryInterface.getForeignKeyReferencesForTable(
        'hosts',
        sequelize.options as never,
      )) as unknown as Reference[];
      return found.map(portable);
    }));
});
