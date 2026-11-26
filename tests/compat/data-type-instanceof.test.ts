import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

const NAMES = [
  'STRING',
  'CHAR',
  'TEXT',
  'INTEGER',
  'SMALLINT',
  'BIGINT',
  'NUMBER',
  'FLOAT',
  'DECIMAL',
  'DOUBLE',
  'JSON',
  'JSONB',
  'UUID',
  'DATE',
  'DATEONLY',
  'BOOLEAN',
  'ENUM',
  'ARRAY',
] as const;

describe('compat: instanceof DataTypes', () => {
  it('model attribute types are instances of their data type and of its v6 base types', () =>
    expectSameResult('', async (lib, sequelize) => {
      const types = lib.DataTypes;
      const Item = sequelize.define('Item', {
        string: types.STRING,
        char: new types.CHAR(3),
        text: types.TEXT,
        integer: types.INTEGER,
        smallint: types.SMALLINT,
        bigint: types.BIGINT,
        float: types.FLOAT,
        decimal: types.DECIMAL(10, 2),
        double: types.DOUBLE,
        json: types.JSON,
        jsonb: types.JSONB,
        uuid: { type: types.UUID },
        date: types.DATE,
        dateonly: types.DATEONLY,
        boolean: types.BOOLEAN,
        enum: types.ENUM('a', 'b'),
        array: types.ARRAY(types.STRING(4)),
      });
      const attributes = Item.getAttributes() as Record<string, { type: unknown }>;
      return Object.entries(attributes).map(([name, attribute]) => [
        name,
        NAMES.filter(
          (type) => attribute.type instanceof (types[type] as unknown as new () => object),
        ),
      ]);
    }));

  it('a data type factory stringifies to its key', () =>
    expectSameResult('', async (lib) =>
      NAMES.filter((type) => type !== 'DOUBLE' && type !== 'JSON').map((type) =>
        String(lib.DataTypes[type]),
      ),
    ));

  it('keyType gives the generated foreign key its data type', () =>
    expectSameResult('', async (lib, sequelize) => {
      const User = sequelize.define('User', { name: lib.DataTypes.STRING });
      const keyTypes = [lib.DataTypes.INTEGER, lib.DataTypes.BIGINT, lib.DataTypes.STRING];
      const result = keyTypes.map((keyType) => {
        const Task = sequelize.define(`Task_${String(keyType)}`, {});
        const Note = sequelize.define(`Note_${String(keyType)}`, {});
        Task.belongsTo(User, { foreignKey: 'userId', keyType, constraints: false });
        User.hasMany(Note, { foreignKey: 'ownerId', keyType, constraints: false });
        return [Task.getAttributes()['userId'], Note.getAttributes()['ownerId']].map(
          (attribute) => attribute?.type instanceof (keyType as unknown as new () => object),
        );
      });
      await sequelize.sync({ force: true });
      return result;
    }));
});
