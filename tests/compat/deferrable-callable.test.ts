import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

type Callable = () => unknown;

describe('compat: Deferrable modes called as functions', () => {
  it('works bare and called in references', () =>
    expectSameResult('', async (lib, sequelize) => {
      const immediate = lib.Deferrable.INITIALLY_IMMEDIATE as unknown as Callable;
      const deferred = lib.Deferrable.INITIALLY_DEFERRED as unknown as Callable;
      const { INTEGER } = lib.DataTypes;
      sequelize.define('Parent', {});
      sequelize.define('Child', {
        a: {
          type: INTEGER,
          references: { model: 'Parents', key: 'id', deferrable: immediate() } as never,
        },
        b: {
          type: INTEGER,
          references: { model: 'Parents', key: 'id', deferrable: deferred } as never,
        },
      });
      await sequelize.sync({ force: true });
      return sequelize.query(
        `SELECT c.condeferrable, c.condeferred FROM pg_constraint c
         JOIN pg_namespace n ON n.oid = c.connamespace
         WHERE n.nspname = current_schema() AND c.contype = 'f' ORDER BY 2`,
        { type: 'SELECT' as never },
      );
    }));
});
