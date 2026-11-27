import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: a schema copy made before the associations', () => {
  it('has the associations and their foreign keys', () =>
    expectSameResult('', async (lib, sequelize) => {
      const [rows] = await sequelize.query('SELECT current_schema() AS name');
      const schema = (rows[0] as { name: string }).name;
      const options = { timestamps: false };
      const Shop = sequelize.define('shop', { name: lib.DataTypes.STRING }, options);
      const Clerk = sequelize.define('clerk', { name: lib.DataTypes.STRING }, options);
      const ShopCopy = Shop.schema(schema);
      const ClerkCopy = Clerk.schema(schema);
      Shop.hasMany(Clerk, { constraints: false });
      Clerk.belongsTo(Shop, { constraints: false });
      await Shop.sync();
      await Clerk.sync();
      const shop = await ShopCopy.create({ name: 's' });
      await ClerkCopy.create({ name: 'c', shopId: shop.get('id') } as never);
      const found = await ShopCopy.findOne({ include: [{ model: ClerkCopy }] });
      const clerk = await ClerkCopy.findOne({ include: [{ model: ShopCopy }] });
      return [found, clerk, Object.keys(ClerkCopy.rawAttributes).toSorted()];
    }));
});
