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
import { registerFileDatabase } from '../../support/file-database-hooks.ts';

// Extensions are database-wide: a parallel file that creates the same one would break this file.
registerFileDatabase();

describe('S14 data types keep values bound and DDL escaped', () => {
  it('round-trips arbitrary HSTORE keys and values, including where operators', () =>
    withCanary(async ({ sequelize }) => {
      await sequelize.query('CREATE EXTENSION IF NOT EXISTS hstore');
      const Item = sequelize.define('Item', { meta: DataTypes.HSTORE }, { timestamps: false });
      await Item.sync();
      await fc.assert(
        fc.asyncProperty(textValue(), textValue(), async (key, value) => {
          await Item.destroy({ where: {}, truncate: true });
          await Item.create({ meta: { [key]: value, other: null } });
          const found = await Item.findAll({
            where: { meta: { [Op.contains]: { [key]: value } } },
          });
          expect(found.map((row) => row.get('meta'))).toEqual([{ [key]: value, other: null }]);
          expect(
            await Item.count({ where: { meta: { [Op.eq]: { [key]: value, other: null } } } }),
          ).toBe(1);
        }),
        propertyParameters(),
      );
    }));

  it('escapes an HSTORE column default as a literal', () =>
    withCanary(async ({ sequelize }) => {
      await sequelize.query('CREATE EXTENSION IF NOT EXISTS hstore');
      const defaults = PAYLOADS.map((payload) => ({ [payload]: payload }));
      for (const [index, defaultValue] of defaults.entries()) {
        const Item = sequelize.define(
          `Item${index}`,
          { meta: { type: DataTypes.HSTORE, defaultValue } },
          { timestamps: false },
        );
        await Item.sync();
        expect((await Item.create({})).get('meta')).toEqual(defaultValue);
      }
    }));

  it('binds payload values written to ltree, money, macaddr8, xml, bit, varbit, tsquery and timestamp columns', () =>
    withCanary(async ({ sequelize }) => {
      await sequelize.query('CREATE EXTENSION IF NOT EXISTS ltree');
      const columns = {
        path: DataTypes.LTREE,
        price: DataTypes.MONEY,
        mac: DataTypes.MACADDR8,
        doc: DataTypes.XML,
        flags: DataTypes.BIT(4),
        loose: DataTypes.VARBIT,
        q: DataTypes.TSQUERY,
        at: DataTypes.TIMESTAMP,
      };
      const Item = sequelize.define('Item', columns, { timestamps: false });
      await Item.sync();
      for (const payload of PAYLOADS) {
        for (const name of Object.keys(columns)) {
          // These types reject malformed text with their own 42601; the canary proves nothing was injected.
          await settle(Item.create({ [name]: payload }));
          await settle(Item.count({ where: { [name]: payload } }));
        }
      }
      // Accepted payloads (xml, tsquery text) are stored as data; nothing else changed.
      expect(await Item.count({ where: { path: { [Op.ne]: null } } })).toBe(0);
    }));

  it('requires integer BIT, VARBIT and TIMESTAMP parameters', () => {
    const payload = '1); CREATE TABLE pwned (); --' as unknown as number;
    expect(() => DataTypes.BIT(payload)).toThrow(/must be a non-negative integer/);
    expect(() => DataTypes.VARBIT(payload)).toThrow(/must be a non-negative integer/);
    expect(() => DataTypes.TIMESTAMP(payload)).toThrow(/must be a non-negative integer/);
  });
});
