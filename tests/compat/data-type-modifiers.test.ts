import { describe, it } from 'vitest';
import { expectSameResult, type Lib } from '../support/compat.ts';

type Types = Readonly<Record<string, unknown>>;

const columns = (D: Lib['DataTypes']): Types => {
  // the v6 typings of these forms are wider than the postgrelize ones
  // oxlint-disable-next-line typescript/no-explicit-any
  const { STRING, CHAR, FLOAT, REAL, DOUBLE, DECIMAL, BIGINT } = D as unknown as any;
  return {
    s: STRING.BINARY,
    sw: STRING(12).BINARY,
    so: STRING({ length: 12, binary: true }),
    c: CHAR.BINARY,
    f: FLOAT(11).UNSIGNED,
    fd: FLOAT(11, 12).UNSIGNED.ZEROFILL,
    fz: FLOAT.UNSIGNED.ZEROFILL,
    r: REAL({ length: 11, decimals: 12 }).UNSIGNED,
    d: DOUBLE(11).ZEROFILL,
    n: DECIMAL(10, 2).UNSIGNED,
    nz: DECIMAL.UNSIGNED.ZEROFILL,
    b: BIGINT(11).UNSIGNED,
  };
};

describe('compat: data type modifiers', () => {
  it('creates the same columns', () =>
    expectSameResult('', async (lib, sequelize) => {
      sequelize.define('Item', columns(lib.DataTypes) as never);
      await sequelize.sync();
      const [rows] = await sequelize.query(
        `SELECT column_name, data_type, character_maximum_length, numeric_precision, numeric_scale
         FROM information_schema.columns
         WHERE table_name = 'Items' AND table_schema = current_schema() ORDER BY column_name`,
      );
      return rows;
    }));

  it('stores a Buffer in a binary string with typeValidation', () =>
    expectSameResult('', async (lib, sequelize) => {
      const Item = sequelize.define('Item', { token: lib.DataTypes.STRING.BINARY });
      await sequelize.sync();
      await Item.create({ token: Buffer.from('ab') } as never);
      return (await Item.findOne({ raw: true }))?.['token' as never];
    }));
});
