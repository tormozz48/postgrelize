import { describe, it } from 'vitest';
import type { Model, ModelStatic } from '../../src/index.ts';
import { expectSameResult } from '../support/compat.ts';

const keys = (model: ModelStatic<Model>): unknown => [
  model.primaryKeyAttribute ?? null,
  model.primaryKeyAttributes,
  Object.keys((model as unknown as { primaryKeys: object }).primaryKeys),
  Object.keys(model.getAttributes()),
];

describe('compat: removeAttribute of the generated primary key', () => {
  it('leaves the model without a primary key', () =>
    expectSameResult('', async (lib, sequelize) => {
      const Item = sequelize.define('Item', { name: lib.DataTypes.STRING });
      const Other = sequelize.define('Other', {});
      const before = keys(Item);
      Item.removeAttribute('id');
      const removed = keys(Item);
      Item.belongsTo(Other);
      await sequelize.sync({ force: true });
      await Item.create({ name: 'a' });
      return [before, removed, keys(Item), (await Item.findAll({ raw: true })).length];
    }));
});
