import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: nested create of a belongsTo parent with a NOT NULL key', () => {
  it('creates the parent first', () =>
    expectSameResult('', async (lib, sequelize) => {
      const { STRING } = lib.DataTypes;
      const options = { timestamps: false };
      const User = sequelize.define('user', { name: STRING }, options);
      const Product = sequelize.define('product', { title: STRING }, options);
      Product.belongsTo(User, { foreignKey: { name: 'userId', allowNull: false } });
      await sequelize.sync();
      const created = await Product.create(
        { title: 'chair', user: { name: 'M' } },
        { include: [User] },
      );
      const missing = await Product.create({ title: 'x' }).catch((error: Error) => error.message);
      return [created.get('userId'), missing];
    }));
});
