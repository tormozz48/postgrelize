import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: includes of merged scopes and find options', () => {
  it('concatenates different models and merges entries of the same model', () =>
    expectSameResult('', async (lib, sequelize) => {
      const { STRING } = lib.DataTypes;
      const Foo = sequelize.define('foo', { name: STRING }, { timestamps: false });
      const Bar = sequelize.define('bar', { name: STRING }, { timestamps: false });
      const Baz = sequelize.define('baz', { name: STRING }, { timestamps: false });
      Foo.belongsTo(Baz, { foreignKey: 'bazId' });
      Foo.hasMany(Bar, { foreignKey: 'fooId' });
      Foo.addScope('bar', { include: Bar });
      Foo.addScope('baz', { include: { model: Baz } });
      Foo.addScope('barTwo', { include: [{ model: Bar, where: { name: 'two' } }] });
      await sequelize.sync({ force: true });
      const baz = await Baz.create({ name: 'baz' });
      const foo = await Foo.create({ name: 'foo', bazId: baz.get('id') });
      await Bar.bulkCreate([
        { name: 'one', fooId: foo.get('id') },
        { name: 'two', fooId: foo.get('id') },
      ]);
      const read = async (scopes: string[], options: object = {}): Promise<unknown> =>
        (await Foo.scope(...scopes).findOne(options))?.toJSON();
      return [
        await read(['bar', 'baz']),
        await read(['bar', 'barTwo']),
        await read(['barTwo', 'bar']),
        await read(['bar'], { include: [Bar] }),
        await read(['barTwo'], { include: [{ model: Bar, attributes: ['name'] }, Baz] }),
      ];
    }));
});
