import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DataTypes, literal, type Sequelize } from '../../../src/index.ts';
import { PAYLOADS, propertyParameters, textValue, withCanary } from '../../support/injection.ts';

const defineItem = async (sequelize: Sequelize) => {
  const Item = sequelize.define(
    'Item',
    { code: DataTypes.TEXT, qty: DataTypes.INTEGER },
    { timestamps: false },
  );
  await Item.sync();
  return Item;
};

describe('finder replacements stay bound values', () => {
  it('binds every payload given as a named or positional replacement', () =>
    withCanary(async ({ sequelize }) => {
      const Item = await defineItem(sequelize);
      for (const payload of PAYLOADS) {
        await Item.destroy({ where: {}, truncate: true });
        await Item.create({ code: payload, qty: 1 });
        await Item.create({ code: 'other', qty: 2 });
        const named = await Item.findAll({
          where: literal('"code" = :code'),
          replacements: { code: payload },
        });
        const positional = await Item.findAll({
          where: literal('"code" = ?'),
          replacements: [payload],
        });
        const listed = await Item.findAll({
          where: literal('"code" IN (:codes)'),
          replacements: { codes: [payload, 'none'] },
        });
        expect([named.length, positional.length, listed.length]).toEqual([1, 1, 1]);
        expect(
          await Item.count({ where: literal('"code" = :code'), replacements: { code: payload } }),
        ).toBe(1);
      }
    }));

  it('round-trips arbitrary strings, also next to values the finder binds itself', () =>
    withCanary(async ({ sequelize }) => {
      const Item = await defineItem(sequelize);
      await fc.assert(
        fc.asyncProperty(textValue(), textValue(), async (value, other) => {
          await Item.destroy({ where: {}, truncate: true });
          await Item.create({ code: value, qty: 1 });
          await Item.create({ code: `${value}!`, qty: 2 });
          const rows = await Item.findAll({
            where: { qty: 1, code: value },
            attributes: ['code', [literal(':echo::text'), 'echo']],
            replacements: { echo: other },
          });
          expect(rows.map((row) => [row.get('code'), row.get('echo')])).toEqual([[value, other]]);
          const found = await Item.findOne({
            where: literal('"code" = ?'),
            replacements: [`${value}!`],
          });
          expect(found?.get('qty')).toBe(2);
        }),
        propertyParameters(),
      );
    }));

  it('does not expand placeholder lookalikes inside values the finder binds itself', () =>
    withCanary(async ({ sequelize }) => {
      const Item = await defineItem(sequelize);
      await Item.create({ code: ':code ? $1', qty: 1 });
      const rows = await Item.findAll({
        where: { code: ':code ? $1' },
        replacements: { code: 'unused' },
      });
      expect(rows).toHaveLength(1);
    }));

  it('rejects a placeholder without a value instead of sending it to the server', () =>
    withCanary(async ({ sequelize }) => {
      const Item = await defineItem(sequelize);
      await expect(
        Item.findAll({ where: literal('"code" = :missing'), replacements: { other: 1 } }),
      ).rejects.toThrow(/Named replacement ":missing" has no entry in the replacement map/);
    }));
});
