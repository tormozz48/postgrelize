import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DataTypes, caseWhen, col, where, Op } from '../../../src/index.ts';
import {
  PAYLOADS,
  propertyParameters,
  textValue,
  withCanary,
  type CanaryContext,
} from '../../support/injection.ts';

const defineItem = async ({ sequelize }: CanaryContext) => {
  const Item = sequelize.define('Item', { code: DataTypes.TEXT }, { timestamps: false });
  await Item.sync();
  await Item.create({ code: 'seed' });
  return Item;
};

describe('caseWhen keeps conditions and results bound', () => {
  it('returns arbitrary strings unchanged from THEN, ELSE and conditions', () =>
    withCanary(async (context) => {
      const Item = await defineItem(context);
      const check = async (value: string) => {
        const hit = caseWhen().when({ code: 'seed' }, value).else('no');
        const missed = caseWhen().when({ code: value }, 'yes').else(value);
        const rows = await Item.findAll({
          attributes: [
            [hit, 'hit'],
            [missed, 'missed'],
          ],
          where: where(hit, Op.eq, value),
          order: [[hit, 'ASC']],
          raw: true,
        });
        expect(rows).toEqual([{ hit: value, missed: value === 'seed' ? 'yes' : value }]);
      };
      for (const payload of PAYLOADS.filter((item) => !item.includes('\u0000'))) {
        await check(payload);
      }
      await fc.assert(fc.asyncProperty(textValue(), check), propertyParameters());
    }));

  it('quotes a column named inside a condition or an Op.any expression', () =>
    withCanary(async (context) => {
      const Item = await defineItem(context);
      for (const payload of PAYLOADS.filter((item) => !item.includes('\u0000'))) {
        const attempts = [
          Item.findAll({ attributes: [[caseWhen().when({ [payload]: 1 }, 1), 'x']] }),
          Item.findAll({ where: { id: { [Op.any]: col(payload) } } }),
        ];
        for (const result of await Promise.allSettled(attempts)) {
          const code = (result as { reason?: { original?: { code?: string } } }).reason?.original
            ?.code;
          expect(code).not.toBe('42601');
        }
      }
    }));
});
