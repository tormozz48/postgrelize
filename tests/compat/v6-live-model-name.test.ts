import { expect, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

it('the table alias follows Model.name when it was redefined after init', async () => {
  const result = await expectSameResult('', async (lib, sequelize) => {
    const F = sequelize.define(
      'File',
      {
        id: { type: lib.DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        hash: lib.DataTypes.STRING,
      },
      { tableName: 'f95', timestamps: false },
    );
    await sequelize.sync({ force: true });
    await F.create({ hash: 'a' } as never);
    Object.defineProperty(F, 'name', { value: 'File$1', configurable: true });
    const rows = await F.findAll({
      where: sequelize.literal(`"${F.name}"."hash" = 'a'`),
    });
    const logged: string[] = [];
    await F.findAll({ logging: (sql: string) => logged.push(sql) });
    return [rows.length, /FROM "f95" AS "File\$1"/.test(logged[0] ?? '')];
  });
  expect(result).toEqual([1, true]);
});

it('an include of a renamed model aliases consistently in SELECT, JOIN and WHERE', async () => {
  const result = await expectSameResult('', async (lib, sequelize) => {
    const Batch = sequelize.define('Batch', { label: lib.DataTypes.STRING }, { timestamps: false });
    const File = sequelize.define('File', { hash: lib.DataTypes.STRING }, { timestamps: false });
    Batch.hasMany(File, { as: 'files', foreignKey: 'batchId' });
    File.belongsTo(Batch, { as: 'batch', foreignKey: 'batchId' });
    await sequelize.sync({ force: true });
    const batch = await Batch.create({ label: 'b' } as never);
    await File.create({ hash: 'a', batchId: batch.get('id') } as never);
    Object.defineProperty(Batch, 'name', { value: 'Batch$1', configurable: true });
    Object.defineProperty(File, 'name', { value: 'File$1', configurable: true });
    const rows = await File.findAll({
      include: [{ association: File.associations['batch'] as never, required: true }],
      where: sequelize.literal(`"${File.name}"."hash" = 'a' AND "batch"."label" = 'b'`),
    });
    const batches = await Batch.findAll({
      include: [{ association: Batch.associations['files'] as never }],
      where: sequelize.literal(`"${Batch.name}"."label" = 'b'`),
    });
    return [
      rows.length,
      (rows[0]?.get('batch') as { get(k: string): unknown } | undefined)?.get('label'),
      batches.length,
      (batches[0]?.get('files') as unknown[] | undefined)?.length,
    ];
  });
  expect(result).toEqual([1, 'b', 1, 1]);
});
