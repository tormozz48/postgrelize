import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: schema of createTable and describeTable', () => {
  it('places the table and its enum in options.schema and reads it back', () =>
    expectSameResult('', async (lib, sequelize) => {
      const queryInterface = sequelize.getQueryInterface();
      const schema = `s_${Math.floor(Math.random() * 1e9)}`;
      await queryInterface.createSchema(schema);
      try {
        await queryInterface.createTable(
          'things',
          { state: { type: lib.DataTypes.ENUM, values: ['a', 'b'] } as never },
          { schema } as never,
        );
        const byString = await queryInterface.describeTable('things', schema as never);
        const byOptions = await queryInterface.describeTable('things', { schema });
        return [byString['state']?.special, Object.keys(byOptions)];
      } finally {
        await queryInterface.dropSchema(schema);
      }
    }));
});
