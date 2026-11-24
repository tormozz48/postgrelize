import { expect, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

type Loaded = Record<string, unknown> & { reload(options?: unknown): Promise<unknown> };

it('reload() without options loads the include the instance was loaded with', async () => {
  const result = await expectSameResult('', async (lib, sequelize) => {
    const P = sequelize.define('LP', { name: lib.DataTypes.STRING });
    const C = sequelize.define('LC', { label: lib.DataTypes.STRING });
    P.hasOne(C, { as: 'c', foreignKey: 'pId' });
    await sequelize.sync({ force: true });
    const p = await P.create({ name: 'p' });
    await C.create({ pId: p.get('id'), label: 'x' } as never);
    const a = (await P.findByPk(p.get('id') as number, {
      include: [{ association: P.associations['c'] as never }],
    })) as unknown as Loaded;
    const before = a['c'] !== undefined;
    await C.update({ label: 'y' } as never, { where: { pId: p.get('id') } });
    await a.reload();
    return [before, (a['c'] as { label: string } | undefined)?.label];
  });
  expect(result).toEqual([true, 'y']);
});

it('reload() of an instance loaded without includes loads none', () =>
  expectSameResult('', async (lib, sequelize) => {
    const P = sequelize.define('LQ', { name: lib.DataTypes.STRING });
    const C = sequelize.define('LR', { label: lib.DataTypes.STRING });
    P.hasOne(C, { as: 'c', foreignKey: 'pId' });
    await sequelize.sync({ force: true });
    const p = await P.create({ name: 'p' });
    await C.create({ pId: p.get('id'), label: 'x' } as never);
    const a = (await P.findByPk(p.get('id') as number)) as unknown as Loaded;
    await a.reload();
    return a['c'] === undefined;
  }));
