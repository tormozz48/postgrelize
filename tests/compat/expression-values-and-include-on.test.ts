import { it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

type Lib = Parameters<Parameters<typeof expectSameResult>[1]>[0];
type Db = Parameters<Parameters<typeof expectSameResult>[1]>[1];

const setup = async (lib: Lib, sequelize: Db) => {
  const Doc = sequelize.define('Doc', {
    amount: lib.DataTypes.INTEGER,
    kind: lib.DataTypes.STRING,
    ownerId: lib.DataTypes.INTEGER,
  });
  Doc.hasMany(Doc, { as: 'children', foreignKey: 'ownerId' });
  await sequelize.sync({ force: true });
  return Doc;
};

it('Model.update and instance.update accept fn / literal values', () =>
  expectSameResult('', async (lib, sequelize) => {
    const Doc = await setup(lib, sequelize);
    const row = await Doc.create({ amount: -5, kind: 'a' });
    await Doc.update(
      { amount: lib.fn('abs', lib.col('amount')) },
      { where: { id: row.get('id') } },
    );
    await row.reload();
    const afterStatic = row.get('amount');
    await row.update({ amount: lib.literal('amount * 2') });
    await row.reload();
    return [afterStatic, row.get('amount'), row.get('kind')];
  }));

it('an include `on` replaces the default join condition', () =>
  expectSameResult('', async (lib, sequelize) => {
    const Doc = await setup(lib, sequelize);
    const parent = await Doc.create({ amount: 1, kind: 'p' });
    await Doc.create({ amount: 2, kind: 'c', ownerId: parent.get('id') });
    await Doc.create({ amount: 3, kind: 'other', ownerId: null });
    const rows = await Doc.findAll({
      where: { kind: 'p' },
      include: [
        {
          model: Doc,
          as: 'children',
          required: false,
          on: {
            [lib.Op.and]: [
              lib.where(lib.col('children.ownerId'), '=', lib.col('Doc.id')),
              { amount: 2 },
            ],
          },
        },
      ],
    });
    return rows.map((row) => [
      row.get('kind'),
      (row as unknown as { children: { get(k: string): unknown }[] }).children.map((child) =>
        child.get('amount'),
      ),
    ]);
  }));

it('findAndCountAll with group counts per group', () =>
  expectSameResult('', async (lib, sequelize) => {
    const Doc = await setup(lib, sequelize);
    await Doc.bulkCreate([
      { amount: 1, kind: 'a' },
      { amount: 2, kind: 'a' },
      { amount: 3, kind: 'b' },
    ]);
    const { count, rows } = await Doc.findAndCountAll({ group: ['kind'], attributes: ['kind'] });
    return [
      (count as unknown as { kind: string; count: number }[])
        .map((entry) => [entry.kind, Number(entry.count)])
        .toSorted(),
      rows.length,
    ];
  }));
