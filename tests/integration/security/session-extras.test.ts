import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DataTypes } from '../../../src/index.ts';
import { PAYLOADS, propertyParameters, textValue, withCanary } from '../../support/injection.ts';

describe('S16 inputs never reach SQL as text', () => {
  it('transaction deferrable accepts only booleans', () =>
    withCanary(async ({ sequelize }) => {
      for (const payload of PAYLOADS) {
        await expect(sequelize.transaction({ deferrable: payload as never })).rejects.toThrow(
          /Invalid deferrable option/,
        );
      }
    }));

  it('statementTimeout accepts only non-negative integers', () =>
    withCanary(async ({ sequelize }) => {
      for (const payload of PAYLOADS) {
        await expect(
          sequelize.query('SELECT 1', { statementTimeout: payload as never }),
        ).rejects.toThrow(/non-negative integer/);
      }
      expect(await sequelize.query('SELECT 1', { statementTimeout: 1000 })).toBeDefined();
    }));

  it('unnest round-trips payloads and arbitrary strings as bound array elements', () =>
    withCanary(async ({ sequelize }) => {
      const Item = sequelize.define('Item', { code: DataTypes.TEXT }, { timestamps: false });
      await Item.sync();
      const created = await Item.bulkCreate(
        PAYLOADS.map((code) => ({ code })),
        { unnest: true },
      );
      expect(created.map((row) => row.get('code'))).toEqual([...PAYLOADS]);
      await fc.assert(
        fc.asyncProperty(fc.array(textValue(), { minLength: 1, maxLength: 5 }), async (values) => {
          await Item.destroy({ where: {}, truncate: true });
          const rows = await Item.bulkCreate(
            values.map((code) => ({ code })),
            { unnest: true },
          );
          expect(rows.map((row) => row.get('code'))).toEqual(values);
        }),
        propertyParameters(),
      );
    }));
});
