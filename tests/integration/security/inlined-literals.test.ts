import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { col, DataTypes, fn, Op, where, type Sequelize } from '../../../src/index.ts';
import { PAYLOADS, settle, textValue, withCanary } from '../../support/injection.ts';

const defineItem = async (sequelize: Sequelize) => {
  const Item = sequelize.define('Item', { code: DataTypes.TEXT }, { timestamps: false });
  await Item.sync();
  return Item;
};

describe('string arguments of fn() and values of Op.is are escaped into the SQL text', () => {
  it('keeps every payload given to fn() a plain string', () =>
    withCanary(async ({ sequelize }) => {
      const Item = await defineItem(sequelize);
      await Item.create({ code: 'a' });
      for (const payload of PAYLOADS) {
        const rows = await Item.findAll({
          attributes: [[fn('concat', payload, col('code')), 'echo']],
          where: where(fn('concat_ws', payload, col('code'), 'z'), Op.eq, `a${payload}z`),
          raw: true,
        });
        expect(rows).toEqual([{ echo: `${payload}a` }]);
      }
    }));

  it('round-trips arbitrary strings through fn()', () =>
    withCanary(async ({ sequelize }) => {
      const Item = await defineItem(sequelize);
      await Item.create({ code: 'a' });
      await fc.assert(
        fc.asyncProperty(textValue(), async (value) => {
          const rows = await Item.findAll({
            attributes: [[fn('concat', value, col('code')), 'echo']],
            raw: true,
          });
          expect(rows).toEqual([{ echo: `${value}a` }]);
        }),
        { numRuns: 25 },
      );
    }));

  it('never lets a payload given to Op.is run as SQL', () =>
    withCanary(async ({ sequelize }) => {
      const Item = await defineItem(sequelize);
      for (const payload of PAYLOADS) {
        // `IS 'text'` is a PostgreSQL syntax error; the canary checks in withCanary prove that nothing else ran
        const outcome = await settle(Item.findAll({ where: { code: { [Op.is]: payload } } }));
        expect(outcome).toBeInstanceOf(Error);
      }
    }));
});
