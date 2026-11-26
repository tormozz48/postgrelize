import { describe, it } from 'vitest';
import type { ModelStatic, Model } from '../../src/index.ts';
import { expectSameResult } from '../support/compat.ts';

type Attribute = Record<string, unknown>;

const raw = (model: ModelStatic<Model>): Record<string, Attribute | undefined> =>
  (model as unknown as { rawAttributes: Record<string, Attribute> }).rawAttributes;

describe('compat: changing rawAttributes and calling refreshAttributes', () => {
  it('added, changed and deleted entries take effect', () =>
    expectSameResult('', async (lib, sequelize) => {
      const { STRING, CHAR } = lib.DataTypes;
      const Item = sequelize.define('Item', { name: STRING, gone: STRING });
      const Owner = sequelize.define('Owner', {});
      raw(Item)['ownerKey'] = { type: CHAR(20), field: 'owner_key' };
      raw(Item)['name']!['allowNull'] = false;
      delete raw(Item)['gone'];
      Item.refreshAttributes();
      Item.belongsTo(Owner, { foreignKey: 'ownerKey', constraints: false });
      await sequelize.sync({ force: true });
      const columns = await sequelize.query(
        `SELECT column_name, is_nullable FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = 'Items' ORDER BY 1`,
        { type: 'SELECT' as never },
      );
      await Item.create({ name: 'a', ownerKey: 'k' } as never);
      const found = await Item.findOne();
      return {
        columns,
        field: raw(Item)['ownerKey']?.['field'],
        value: String(found?.get('ownerKey')).trim(),
      };
    }));
});
