import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DataTypes, Op, QueryTypes, type Sequelize } from '../../../src/index.ts';
import { PAYLOADS, propertyParameters, textValue, withCanary } from '../../support/injection.ts';

const defineItem = async (sequelize: Sequelize) => {
  const Item = sequelize.define(
    'Item',
    {
      code: { type: DataTypes.TEXT, unique: true },
      label: DataTypes.TEXT,
      attrs: DataTypes.JSONB,
      tags: DataTypes.ARRAY(DataTypes.TEXT),
    },
    { timestamps: false },
  );
  await Item.sync();
  return Item;
};

describe('values are bound on every write and read path', () => {
  it('round-trips arbitrary strings through create, where operators, update and destroy', () =>
    withCanary(async ({ sequelize }) => {
      const Item = await defineItem(sequelize);
      await fc.assert(
        fc.asyncProperty(textValue(), textValue(), async (value, other) => {
          await Item.destroy({ where: {}, truncate: true });
          const created = await Item.create({ code: value, label: value, tags: [value] });
          expect(created.get('code')).toBe(value);
          const read = async (where: Record<string, unknown>) =>
            (await Item.findAll({ where })).map((row) => row.get('code'));
          expect(await read({ code: value })).toEqual([value]);
          expect(await read({ code: { [Op.eq]: value } })).toEqual([value]);
          expect(await read({ code: { [Op.in]: [value, other] } })).toEqual([value]);
          // LIKE-family operators keep pattern semantics (as in v6): wildcards are escaped by the caller.
          const pattern = value.replaceAll(/[%_\\]/g, '\\$&');
          expect(await read({ code: { [Op.like]: pattern } })).toEqual([value]);
          expect(await read({ code: { [Op.startsWith]: pattern } })).toEqual([value]);
          expect(await read({ code: { [Op.substring]: pattern } })).toEqual([value]);
          expect(await read({ tags: { [Op.contains]: [value] } })).toEqual([value]);
          expect(await read({ [Op.or]: [{ code: value }, { label: other }] })).toEqual([value]);
          await Item.update({ label: other }, { where: { code: value } });
          expect(await Item.count({ where: { label: other } })).toBe(1);
          await Item.destroy({ where: { code: value } });
          expect(await Item.count()).toBe(0);
        }),
        propertyParameters(),
      );
    }));

  it('round-trips arbitrary JSON keys and values, including nested where paths', () =>
    withCanary(async ({ sequelize }) => {
      const Item = await defineItem(sequelize);
      await fc.assert(
        fc.asyncProperty(textValue(), textValue(), async (key, value) => {
          await Item.destroy({ where: {}, truncate: true });
          await Item.create({ code: 'c', attrs: { [key]: value, nested: { [key]: value } } });
          const found = await Item.findAll({ where: { attrs: { [key]: value } } });
          expect(found.map((row) => row.get('attrs'))).toEqual([
            { [key]: value, nested: { [key]: value } },
          ]);
          expect(await Item.count({ where: { attrs: { nested: { [key]: value } } } })).toBe(1);
          expect(await Item.count({ where: { attrs: { [Op.contains]: { [key]: value } } } })).toBe(
            1,
          );
        }),
        propertyParameters(),
      );
    }));

  it('round-trips arbitrary strings through upsert, bulkCreate conflict updates and increment', () =>
    withCanary(async ({ sequelize }) => {
      const Item = await defineItem(sequelize);
      await fc.assert(
        fc.asyncProperty(textValue(), textValue(), async (code, label) => {
          await Item.destroy({ where: {}, truncate: true });
          await Item.upsert({ code, label: 'first' });
          await Item.upsert({ code, label });
          await Item.bulkCreate([{ code, label }], { updateOnDuplicate: ['label'] });
          const rows = await Item.findAll();
          expect(rows.map((row) => [row.get('code'), row.get('label')])).toEqual([[code, label]]);
        }),
        propertyParameters(),
      );
    }));

  it('binds replacements and bind parameters of raw queries', () =>
    withCanary(async ({ sequelize }) => {
      await fc.assert(
        fc.asyncProperty(textValue(), async (value) => {
          const select = { type: QueryTypes.SELECT, plain: true } as const;
          expect(
            await sequelize.query('SELECT :v::text AS v', {
              ...select,
              replacements: { v: value },
            }),
          ).toEqual({ v: value });
          expect(
            await sequelize.query('SELECT ?::text AS v', { ...select, replacements: [value] }),
          ).toEqual({
            v: value,
          });
          expect(
            await sequelize.query('SELECT $1::text AS v', { ...select, bind: [value] }),
          ).toEqual({ v: value });
          expect(
            await sequelize.query('SELECT $v::text AS v', { ...select, bind: { v: value } }),
          ).toEqual({
            v: value,
          });
        }),
        propertyParameters(),
      );
    }));

  it('treats replacement markers inside payload values as data', () =>
    withCanary(async ({ sequelize }) => {
      for (const payload of PAYLOADS) {
        const result = await sequelize.query('SELECT :a::text AS a, :b::text AS b', {
          type: QueryTypes.SELECT,
          plain: true,
          replacements: { a: payload, b: ':a' },
        });
        expect(result).toEqual({ a: payload, b: ':a' });
      }
    }));
});
