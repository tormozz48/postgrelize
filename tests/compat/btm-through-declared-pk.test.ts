import { describe, it } from 'vitest';
import type { Model } from '../../src/index.ts';
import { expectSameResult, type Lib } from '../support/compat.ts';

type Sequelize = InstanceType<Lib['Sequelize']>;

const ownId = (lib: Lib) => ({
  id: { type: lib.DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
});

const link = (
  lib: Lib,
  sequelize: Sequelize,
  declared: object,
  through: { unique?: boolean } = {},
  uniqueKey?: string,
) => {
  const Msg = sequelize.define('Msg', {});
  const Doc = sequelize.define('Doc', {});
  const MsgDoc = sequelize.define('MsgDoc', declared as never, { tableName: 'msg_docs' });
  const keys = { foreignKey: 'msgId', otherKey: 'docId' };
  Msg.belongsToMany(Doc, {
    through: { model: MsgDoc, ...through },
    as: 'docs',
    ...keys,
    ...(uniqueKey === undefined ? {} : { uniqueKey }),
  });
  return { Msg, Doc, MsgDoc };
};

const schemaOf = async (sequelize: Sequelize): Promise<unknown> => {
  const [columns] = await sequelize.query(
    `SELECT column_name, is_nullable FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'msg_docs' ORDER BY column_name`,
  );
  const [constraints] = await sequelize.query(
    // v6 leaves unique constraints unnamed, postgrelize names them: compare the primary key name only
    `SELECT CASE contype WHEN 'p' THEN conname END AS name, pg_get_constraintdef(oid) AS definition
     FROM pg_constraint WHERE conrelid = 'msg_docs'::regclass AND contype IN ('p', 'u')
     ORDER BY definition`,
  );
  return { columns, constraints };
};

describe('compat: primary key of a belongsToMany through model', () => {
  it('keeps a declared id: primaryKeyAttributes, sync, update and findByPk', () =>
    expectSameResult('', async (lib, sequelize) => {
      const { Msg, Doc, MsgDoc } = link(lib, sequelize, {
        ...ownId(lib),
        msgId: { type: lib.DataTypes.INTEGER, allowNull: false },
        docId: { type: lib.DataTypes.INTEGER, allowNull: false },
      });
      await sequelize.sync({ force: true });
      const [one, two] = [await Msg.create(), await Msg.create()];
      const doc = await Doc.create();
      const row = (await MsgDoc.create({ msgId: one.get('id'), docId: doc.get('id') })) as Model;
      await row.update({ msgId: two.get('id') });
      const stored = await MsgDoc.findByPk(row.get('id') as number);
      return {
        primaryKeys: MsgDoc.primaryKeyAttributes,
        updated: row.get('msgId'),
        stored: stored?.get('msgId'),
        schema: await schemaOf(sequelize),
      };
    }));

  it.each([
    ['unique: false', { unique: false }, undefined],
    ['uniqueKey', {}, 'msg_doc_link'],
    ['the default unique key', {}, undefined],
  ])('follows %s with a declared id', async (_name, through, uniqueKey) => {
    await expectSameResult('', async (lib, sequelize) => {
      const { MsgDoc } = link(lib, sequelize, ownId(lib), through, uniqueKey);
      await sequelize.sync({ force: true });
      return { primaryKeys: MsgDoc.primaryKeyAttributes, schema: await schemaOf(sequelize) };
    });
  });

  it('keeps a declared composite primary key', () =>
    expectSameResult('', async (lib, sequelize) => {
      const key = () => ({ type: lib.DataTypes.INTEGER, primaryKey: true });
      const { MsgDoc } = link(lib, sequelize, { msgId: key(), docId: key() });
      await sequelize.sync({ force: true });
      return { primaryKeys: MsgDoc.primaryKeyAttributes, schema: await schemaOf(sequelize) };
    }));

  it.each([
    ['no declared keys', false],
    ['declared foreign keys', true],
  ])('replaces the automatic id with a composite key, %s', async (_name, declareKeys) => {
    await expectSameResult('', async (lib, sequelize) => {
      const keys = { msgId: lib.DataTypes.INTEGER, docId: lib.DataTypes.INTEGER };
      const { Msg, Doc, MsgDoc } = link(lib, sequelize, declareKeys ? keys : {});
      Doc.belongsToMany(Msg, { through: MsgDoc, foreignKey: 'docId', otherKey: 'msgId' });
      MsgDoc.belongsTo(Msg, { foreignKey: 'msgId' });
      Doc.hasMany(MsgDoc, { foreignKey: 'docId' });
      await sequelize.sync({ force: true });
      return { primaryKeys: MsgDoc.primaryKeyAttributes, schema: await schemaOf(sequelize) };
    });
  });

  it('keeps a declared id when the paired side changes the other key', () =>
    expectSameResult('', async (lib, sequelize) => {
      const Msg = sequelize.define('Msg', {});
      const Doc = sequelize.define('Doc', {});
      const MsgDoc = sequelize.define('MsgDoc', ownId(lib), { tableName: 'msg_docs' });
      Msg.belongsToMany(Doc, { through: MsgDoc, foreignKey: 'message' });
      Doc.belongsToMany(Msg, { through: MsgDoc, foreignKey: 'document' });
      await sequelize.sync({ force: true });
      return { primaryKeys: MsgDoc.primaryKeyAttributes, schema: await schemaOf(sequelize) };
    }));
});
