import { DataTypes, Model, Op, col, excluded, fn, literal, type Sequelize } from 'postgrelize';
import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'postgrelize';

export const run = async (sequelize: Sequelize): Promise<void> => {
  // #region model
  class Counter extends Model<InferAttributes<Counter>, InferCreationAttributes<Counter>> {
    declare id: CreationOptional<number>;
    declare tenant: string;
    declare key: string;
    declare hits: CreationOptional<number>;
    declare version: CreationOptional<number>;
    declare tags: CreationOptional<string[]>;
    declare archived: CreationOptional<boolean>;
  }

  Counter.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      tenant: { type: DataTypes.TEXT, allowNull: false, unique: 'counters_tenant_key' },
      key: { type: DataTypes.TEXT, allowNull: false, unique: 'counters_tenant_key' },
      hits: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      tags: { type: DataTypes.ARRAY(DataTypes.TEXT), allowNull: false, defaultValue: [] },
      archived: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    {
      sequelize,
      tableName: 'counters',
      timestamps: false,
      indexes: [
        { name: 'counters_active_key', unique: true, fields: ['key'], where: { archived: false } },
      ],
    },
  );
  await sequelize.sync();
  await Counter.bulkCreate([
    { tenant: 't1', key: 'a', hits: 1, tags: ['x'] },
    { tenant: 't1', key: 'b', hits: 2, version: 5 },
  ]);
  // #endregion model

  // #region v6
  const [row, created] = await Counter.upsert({ tenant: 't1', key: 'a', hits: 5 });
  // row.hits === 5; created is null on PostgreSQL, as in Sequelize v6

  await Counter.bulkCreate([{ tenant: 't1', key: 'b', hits: 7 }], {
    updateOnDuplicate: ['hits'],
    conflictAttributes: ['tenant', 'key'],
  });
  // #endregion v6

  // #region upsert-on-conflict
  const [visit, isNew] = await Counter.upsert(
    { tenant: 't2', key: 'home', hits: 1 },
    {
      onConflict: {
        target: ['tenant', 'key'],
        action: { update: { hits: literal('"Counter"."hits" + 1') } },
      },
    },
  );
  // isNew === true on the first call, false afterwards (visit.hits is then incremented)
  // #endregion upsert-on-conflict

  // #region increment
  const rows = await Counter.insert(
    [
      { tenant: 't1', key: 'a', hits: 10 },
      { tenant: 't1', key: 'c', hits: 3 },
    ],
    {
      onConflict: {
        target: ['tenant', 'key'],
        action: { update: { hits: literal('"Counter"."hits" + EXCLUDED."hits"') } },
      },
    },
  );
  const report = rows.map((counter) => [counter.key, counter.hits, counter.wasInserted]);
  // report: [['a', 15, false], ['c', 3, true]]
  // #endregion increment

  // #region conditional
  const newer = await Counter.insert(
    [
      { tenant: 't1', key: 'a', hits: 100, version: 2 },
      { tenant: 't1', key: 'b', hits: 100, version: 3 },
    ],
    {
      onConflict: {
        target: ['tenant', 'key'],
        action: {
          update: ['hits', 'version'],
          where: { version: { [Op.lt]: excluded('version') } },
        },
      },
    },
  );
  // only 'a' is updated: 'b' already has version 5; rows that were skipped are not returned
  // #endregion conditional

  // #region targets
  await Counter.bulkCreate([{ tenant: 't1', key: 'a', tags: ['y'] }], {
    onConflict: {
      target: { constraint: 'counters_tenant_key' },
      action: { update: { tags: fn('array_cat', col('Counter.tags'), excluded('tags')) } },
    },
  });

  const [partial] = await Counter.insert(
    { tenant: 't9', key: 'c', hits: 50 },
    {
      onConflict: {
        target: { columns: ['key'], where: { archived: false } },
        action: { update: { hits: excluded('hits') } },
      },
    },
  );
  // partial.tenant === 't1': the existing active row with key 'c' was updated

  const skipped = await Counter.bulkCreate(
    [
      { tenant: 't1', key: 'b' },
      { tenant: 't1', key: 'n' },
    ],
    { onConflict: { action: 'nothing' } },
  );
  // skipped: only the inserted row 'n'
  // #endregion targets

  // #region returning
  const [updatedCount, updated = []] = await Counter.update(
    { hits: 0 },
    { where: { key: ['a', 'b'] }, returning: true },
  );
  const deleted = await Counter.destroy({ where: { key: 'n' }, returning: true });
  // deleted: the removed Counter instances instead of a count
  // #endregion returning

  const snapshot = (await Counter.findAll({ order: [['key', 'ASC']] })).map((counter) => [
    counter.key,
    counter.hits,
    counter.version,
    counter.tags.join('|'),
  ]);
  const actual = JSON.stringify({
    upsert: [row.hits, created, visit.hits, isNew],
    report,
    newer: newer.map((counter) => counter.key),
    partial: [partial?.tenant, partial?.hits, partial?.wasInserted],
    skipped: skipped.map((counter) => counter.key),
    updated: [updatedCount, updated.length],
    deleted: deleted.map((counter) => counter.key),
    snapshot,
  });
  const expected = JSON.stringify({
    upsert: [5, null, 1, true],
    report: [
      ['a', 15, false],
      ['c', 3, true],
    ],
    newer: ['a'],
    partial: ['t1', 50, false],
    skipped: ['n'],
    updated: [2, 2],
    deleted: ['n'],
    snapshot: [
      ['a', 0, 2, 'x|y'],
      ['b', 0, 5, ''],
      ['c', 50, 1, ''],
      ['home', 1, 1, ''],
    ],
  });
  if (actual !== expected) {
    throw new Error(`upserts example: unexpected result ${actual}`);
  }
};
