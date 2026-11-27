import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: references given without a model', () => {
  it('drops tables that reference each other', () =>
    expectSameResult('', async (lib, sequelize) => {
      const { INTEGER } = lib.DataTypes;
      const { Deferrable } = lib as unknown as { Deferrable: { INITIALLY_IMMEDIATE: unknown } };
      const attribute = () => ({
        type: INTEGER,
        references: { deferrable: Deferrable.INITIALLY_IMMEDIATE },
      });
      const A = sequelize.define('a', { bId: attribute() } as never);
      const B = sequelize.define('b', { aId: attribute() } as never);
      A.belongsTo(B, { foreignKey: { name: 'bId', allowNull: false } });
      B.belongsTo(A, { foreignKey: { name: 'aId', allowNull: false } });
      await sequelize.sync();
      await sequelize.drop();
      const [tables] = await sequelize.query(
        'SELECT tablename FROM pg_tables WHERE schemaname = current_schema()',
      );
      return tables;
    }));
});
