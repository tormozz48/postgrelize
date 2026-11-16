import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DataTypes, Op } from '../../../src/index.ts';
import {
  PAYLOADS,
  propertyParameters,
  settle,
  textValue,
  withCanary,
} from '../../support/injection.ts';

describe('S15 data types keep values bound', () => {
  it('binds payload text written to and filtered on geometric columns', () =>
    withCanary(async ({ sequelize }) => {
      const columns = {
        pt: DataTypes.POINT,
        ln: DataTypes.LINE,
        sg: DataTypes.LSEG,
        bx: DataTypes.BOX,
        pa: DataTypes.PATH,
        po: DataTypes.POLYGON,
        ci: DataTypes.CIRCLE,
      };
      const Item = sequelize.define('Item', columns, { timestamps: false });
      await Item.sync();
      for (const payload of PAYLOADS) {
        for (const name of Object.keys(columns)) {
          // Malformed geometric text is rejected by the server (22P02), never executed.
          await settle(Item.create({ [name]: payload }));
          await settle(Item.count({ where: { [name]: payload } }));
        }
      }
      expect(await Item.count()).toBe(0);
    }));

  it('rejects non-finite or non-numeric coordinates before SQL is built', () => {
    for (const payload of PAYLOADS) {
      expect(() => DataTypes.POINT.serialize?.({ x: payload, y: 1 })).toThrow(/finite numbers/);
      expect(() => DataTypes.CIRCLE.serialize?.({ x: 1, y: 1, radius: payload })).toThrow(
        /finite numbers/,
      );
    }
  });

  it('round-trips arbitrary finite coordinates through a point column', () =>
    withCanary(async ({ sequelize }) => {
      const Item = sequelize.define('Item', { pt: DataTypes.POINT }, { timestamps: false });
      await Item.sync();
      await fc.assert(
        fc.asyncProperty(
          fc.double({ noNaN: true, noDefaultInfinity: true }),
          fc.double({ noNaN: true, noDefaultInfinity: true }),
          async (x, y) => {
            await Item.destroy({ where: {}, truncate: true });
            await Item.create({ pt: { x, y } });
            const row = await Item.findOne();
            expect(row?.get('pt')).toEqual({ x, y });
          },
        ),
        propertyParameters(),
      );
    }));

  it('binds payload text written to and filtered on multirange columns', () =>
    withCanary(async ({ sequelize }) => {
      const columns = {
        ints: DataTypes.MULTIRANGE(DataTypes.INTEGER),
        days: DataTypes.MULTIRANGE(DataTypes.DATEONLY),
        stamps: DataTypes.MULTIRANGE(DataTypes.TIMESTAMP),
      };
      const Item = sequelize.define('Item', columns, { timestamps: false });
      await Item.sync();
      for (const payload of PAYLOADS) {
        for (const name of Object.keys(columns)) {
          await settle(Item.create({ [name]: payload }));
          await settle(Item.create({ [name]: [[payload, payload]] }));
          await settle(Item.count({ where: { [name]: payload } }));
        }
      }
      expect(await Item.count()).toBe(0);
    }));

  it('rejects unsupported multirange element types before SQL is built', () => {
    expect(() => DataTypes.MULTIRANGE(DataTypes.TEXT)).toThrow(/does not support subtype/);
  });
});

describe('S15 composite types keep names quoted and values bound', () => {
  it('quotes composite type and field names taken from payloads', () =>
    withCanary(async ({ sequelize }) => {
      for (const [index, payload] of PAYLOADS.entries()) {
        const type = DataTypes.COMPOSITE(payload, {
          [payload]: DataTypes.TEXT,
          other: DataTypes.INTEGER,
        });
        await sequelize.query(type.createSql());
        const Item = sequelize.define(`Item${index}`, { value: type }, { timestamps: false });
        await Item.sync();
        await Item.create({ value: { [payload]: payload, other: 1 } });
        expect((await Item.findOne())?.get('value')).toEqual({ [payload]: payload, other: 1 });
      }
    }));

  it('round-trips arbitrary text through composite fields', () =>
    withCanary(async ({ sequelize }) => {
      const type = DataTypes.COMPOSITE('pair', { a: DataTypes.TEXT, b: DataTypes.TEXT });
      await sequelize.query(type.createSql());
      const Item = sequelize.define('Item', { value: type }, { timestamps: false });
      await Item.sync();
      await fc.assert(
        fc.asyncProperty(textValue(), textValue(), async (a, b) => {
          await Item.destroy({ where: {}, truncate: true });
          await Item.create({ value: { a, b } });
          expect((await Item.findOne())?.get('value')).toEqual({ a, b });
          expect(await Item.count({ where: { value: { [Op.eq]: { a, b } } } })).toBe(1);
        }),
        propertyParameters(),
      );
    }));
});
