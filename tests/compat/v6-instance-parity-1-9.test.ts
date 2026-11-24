import { expect, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

it('reload({ include }) replaces an assigned association instance with the fresh row', () =>
  expectSameResult('', async (lib, sequelize) => {
    const P = sequelize.define('RP', { name: lib.DataTypes.STRING });
    const C = sequelize.define('RC', { data: lib.DataTypes.JSONB });
    P.hasOne(C, { as: 'c', foreignKey: 'pId' });
    await sequelize.sync({ force: true });
    const p = await P.create({ name: 'p' });
    const c0 = await C.create({ pId: p.get('id'), data: { v: 1 } } as never);
    const a = (await P.findByPk(p.get('id') as number)) as unknown as Record<string, unknown> & {
      reload(o: unknown): Promise<unknown>;
    };
    a['c'] = c0;
    await C.update({ data: { v: 2 } } as never, { where: { id: c0.get('id') } });
    await a.reload({ include: [{ association: P.associations['c'], required: false }] });
    return (a['c'] as { data: unknown }).data;
  }));

it('instance.update() leaves the written updatedAt on the instance', async () => {
  const same = await expectSameResult('', async (lib, sequelize) => {
    const T = sequelize.define('UT', { n: lib.DataTypes.INTEGER });
    await sequelize.sync({ force: true });
    const t = await T.create({ n: 1 } as never);
    await new Promise((resolve) => setTimeout(resolve, 30));
    await t.update({ n: 2 } as never);
    const row = (await T.findByPk(t.get('id') as number, { raw: true })) as unknown as {
      updatedAt: Date;
    };
    return (t.get('updatedAt') as Date).getTime() === row.updatedAt.getTime();
  });
  expect(same).toBe(true);
});

it('Model.name equals modelName when the class is renamed', () =>
  expectSameResult('', async (lib, sequelize) => {
    const Renamed = class extends lib.Model {};
    Object.defineProperty(Renamed, 'name', { value: 'File$1' });
    Renamed.init({ label: lib.DataTypes.STRING }, { sequelize, modelName: 'File' });
    const Other = class extends lib.Model {};
    Object.defineProperty(Other, 'name', { value: 'Doc$1' });
    Other.init({ label: lib.DataTypes.STRING }, { sequelize, modelName: 'Doc' });
    const Plain = class extends lib.Model {};
    Object.defineProperty(Plain, 'name', { value: 'Plain$1' });
    Plain.init({ label: lib.DataTypes.STRING }, { sequelize });
    Renamed.hasMany(Other);
    Other.belongsTo(Renamed);
    await sequelize.sync({ force: true });
    const sql: string[] = [];
    await Renamed.findAll({ include: [Other], logging: (s: unknown) => sql.push(String(s)) });
    await Other.findAll({ include: [Renamed], logging: (s: unknown) => sql.push(String(s)) });
    return [
      Renamed.name,
      Other.name,
      Plain.name,
      Object.keys(sequelize.models),
      Renamed.tableName,
      sql.some((q) => q.includes('$1')),
    ];
  }));
