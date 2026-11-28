import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { DataTypes, col, filter, fn } from '../../../src/index.ts';
import { PAYLOADS, propertyParameters, textValue, withCanary } from '../../support/injection.ts';

describe('payloads in aggregate FILTER conditions', () => {
  it('values stay bound', () =>
    withCanary(async ({ sequelize }) => {
      const Note = sequelize.define('Note', { body: DataTypes.TEXT }, { timestamps: false });
      await Note.sync();
      await Note.bulkCreate(PAYLOADS.map((body) => ({ body })));
      const matching = async (body: string): Promise<unknown> => {
        const rows = await Note.findAll({
          attributes: [[filter(fn('COUNT', col('*')), { body }), 'n']],
          raw: true,
        });
        return (rows[0] as unknown as { n: string }).n;
      };
      for (const payload of PAYLOADS) {
        expect(await matching(payload)).toBe('1');
      }
      await fc.assert(
        fc.asyncProperty(textValue(), async (body) => {
          expect(await matching(body)).toBe(String(PAYLOADS.filter((p) => p === body).length));
        }),
        propertyParameters() as fc.Parameters<[string]>,
      );
    }));
});
