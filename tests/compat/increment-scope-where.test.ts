import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

const outcome = async (run: () => Promise<unknown>): Promise<unknown> =>
  run().then(
    () => 'ok',
    (error: Error) => `${error.name}: ${error.message}`,
  );

describe('compat: increment / decrement scope and where', () => {
  it('a scope where limits increment and decrement; an explicit where: {} is allowed', () =>
    expectSameResult('', async (lib, sequelize) => {
      const Item = sequelize.define(
        'Item',
        { kind: lib.DataTypes.STRING, qty: { type: lib.DataTypes.INTEGER, defaultValue: 0 } },
        { scopes: { k1: { where: { kind: 'k1' } } } },
      );
      await sequelize.sync({ force: true });
      await Item.bulkCreate([{ kind: 'k1' }, { kind: 'k2' }, { kind: 'k1' }]);
      await Item.scope('k1').increment('qty', { by: 3, where: {} });
      await Item.scope('k1').decrement('qty', { by: 1 });
      await Item.scope('k1').increment({ qty: 10 }, { where: { id: 1 } });
      const rows = await Item.findAll({ order: [['id', 'ASC']] });
      return rows.map((row) => [row.get('kind'), row.get('qty')]);
    }));

  it('without a where, increment and decrement are rejected and change nothing', () =>
    expectSameResult('', async (lib, sequelize) => {
      const Item = sequelize.define('Item', {
        qty: { type: lib.DataTypes.INTEGER, defaultValue: 0 },
      });
      await sequelize.sync({ force: true });
      await Item.bulkCreate([{}, {}]);
      const noOptions = await outcome(() => Item.increment('qty'));
      const noWhere = await outcome(() => Item.increment(['qty'], { by: 10 }));
      const decrement = await outcome(() => Item.decrement('qty', { by: 2 }));
      const emptyWhere = await outcome(() => Item.increment('qty', { where: {} }));
      const rows = await Item.findAll({ order: [['id', 'ASC']] });
      return { noOptions, noWhere, decrement, emptyWhere, qty: rows.map((row) => row.get('qty')) };
    }));

  it('paranoid and default-scoped models: scope where applies, unscoped needs a where', () =>
    expectSameResult('', async (lib, sequelize) => {
      const Item = sequelize.define(
        'Item',
        { kind: lib.DataTypes.STRING, qty: { type: lib.DataTypes.INTEGER, defaultValue: 0 } },
        { paranoid: true, defaultScope: { where: { kind: 'a' } } },
      );
      await sequelize.sync({ force: true });
      await Item.bulkCreate([{ kind: 'a' }, { kind: 'b' }, { kind: 'a' }]);
      await Item.destroy({ where: { id: 3 } });
      await Item.increment('qty', { by: 2 });
      const unscoped = await outcome(() => Item.unscoped().increment('qty'));
      await Item.unscoped().increment('qty', { where: { kind: 'b' } });
      const rows = await Item.unscoped().findAll({ paranoid: false, order: [['id', 'ASC']] });
      return { unscoped, rows: rows.map((row) => [row.get('kind'), row.get('qty')]) };
    }));
});
