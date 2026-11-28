import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: DataTypes.ABSTRACT', () => {
  it('is the base every data type is an instance of', () =>
    expectSameResult('', async (lib, sequelize) => {
      const { DataTypes } = lib;
      const { ABSTRACT } = DataTypes as unknown as { ABSTRACT: new () => object };
      const User = sequelize.define('User', { name: DataTypes.STRING(64), age: DataTypes.INTEGER });
      return [
        [DataTypes.STRING(8), DataTypes.UUIDV4, DataTypes.ENUM('a')].map(
          (type) => (type as unknown) instanceof ABSTRACT,
        ),
        Object.values(User.rawAttributes).map((attribute) => attribute.type instanceof ABSTRACT),
        (lib.fn('now') as unknown) instanceof ABSTRACT,
        typeof (lib.Sequelize as unknown as Record<string, unknown>)['ABSTRACT'],
      ];
    }));
});
