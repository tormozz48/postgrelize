import { expect, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

type Loaded = Record<string, unknown> & { reload(options?: unknown): Promise<unknown> };

it('reload() of an instance reached through nested includes loads its own includes', async () => {
  const result = await expectSameResult('', async (lib, sequelize) => {
    const P = sequelize.define('NP', { name: lib.DataTypes.STRING });
    const S = sequelize.define('NS', { pct: lib.DataTypes.INTEGER });
    const C = sequelize.define('NC', { label: lib.DataTypes.STRING });
    const Pr = sequelize.define('NR', { first: lib.DataTypes.STRING });
    P.hasMany(S, { as: 'shares', foreignKey: 'pId' });
    S.belongsTo(C, { as: 'counterparty', foreignKey: 'cId' });
    C.hasOne(Pr, { as: 'person', foreignKey: 'cId' });
    await sequelize.sync({ force: true });
    const p = await P.create({ name: 'p' });
    const c = await C.create({ label: 'c' });
    await Pr.create({ cId: c.get('id'), first: 'ann' } as never);
    await S.create({ pId: p.get('id'), cId: c.get('id'), pct: 50 } as never);
    const loaded = (await P.findByPk(p.get('id') as number, {
      include: [
        {
          association: P.associations['shares'] as never,
          include: [
            {
              association: S.associations['counterparty'] as never,
              include: [{ association: C.associations['person'] as never }],
            },
          ],
        },
      ],
    })) as unknown as { shares: { counterparty: Loaded }[] };
    const owner = loaded.shares[0]!.counterparty;
    const before = owner['person'] !== undefined;
    await Pr.update({ first: 'bob' } as never, { where: { cId: c.get('id') } });
    await owner.reload();
    const top = (await C.findByPk(c.get('id') as number, {
      include: [{ association: C.associations['person'] as never }],
    })) as unknown as Loaded;
    await top.reload();
    return [
      before,
      (owner['person'] as { first: string } | undefined)?.first,
      top['person'] !== undefined,
    ];
  });
  expect(result).toEqual([true, 'bob', true]);
});

it('Model.name equals modelName for a renamed class, also in generated SQL', () =>
  expectSameResult('', async (lib, sequelize) => {
    const File$1 = class extends lib.Model {};
    const Batch$1 = class extends lib.Model {};
    File$1.init({ n: lib.DataTypes.INTEGER }, { sequelize, tableName: 'f23', modelName: 'File' });
    Batch$1.init(
      { label: lib.DataTypes.STRING },
      { sequelize, tableName: 'b23', modelName: 'Batch' },
    );
    Batch$1.hasMany(File$1, { as: 'files', foreignKey: 'batchId' });
    File$1.belongsTo(Batch$1, { as: 'batch', foreignKey: 'batchId' });
    await sequelize.sync({ force: true });
    const batch = await Batch$1.create({ label: 'b' } as never);
    await File$1.create({ n: 1, batchId: batch.get('id') } as never);
    const rows = await File$1.findAll({
      include: [{ association: File$1.associations['batch'] as never }],
      where: sequelize.literal(`EXISTS (SELECT 1 WHERE "${File$1.name}"."n" = 1)`),
    });
    return [File$1.name, Batch$1.name, rows.length, rows[0]?.get('batch') !== undefined];
  }));
