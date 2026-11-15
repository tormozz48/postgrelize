import { describe, it } from 'vitest';
import { expectSameError, expectSameResult, type Lib } from '../support/compat.ts';
import type { Sequelize } from '../../src/index.ts';

const TABLES = `
  CREATE TABLE "Notes" (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    body TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ
  );
  CREATE TABLE "Plain" (
    id SERIAL PRIMARY KEY,
    label VARCHAR(255)
  );`;

const defineModels = (lib: Lib, sequelize: Sequelize, log: string[] = []) => {
  const Note = sequelize.define(
    'Note',
    { title: { type: lib.DataTypes.STRING, allowNull: false }, body: lib.DataTypes.TEXT },
    {
      paranoid: true,
      hooks: {
        beforeRestore: () => void log.push('beforeRestore'),
        afterRestore: () => void log.push('afterRestore'),
        beforeSave: () => void log.push('beforeSave'),
      },
    },
  );
  const Plain = sequelize.define(
    'Plain',
    { label: lib.DataTypes.STRING },
    { tableName: 'Plain', timestamps: false },
  );
  return { Note, Plain };
};

describe('compat: instance value tracking', () => {
  it('getDataValue, setDataValue, changed, previous and equals', () =>
    expectSameResult(TABLES, async (lib, sequelize) => {
      const { Note } = defineModels(lib, sequelize);
      const first = await Note.create({ title: 'one', body: 'text' });
      const same = await Note.findByPk(first.getDataValue('id') as number);
      const other = await Note.create({ title: 'two' });
      const notes = {
        read: first.getDataValue('title'),
        cleanChanged: first.changed(),
        cleanPrevious: first.previous(),
      };
      first.setDataValue('title', 'uno');
      const dirty = {
        changed: first.changed(),
        titleChanged: first.changed('title'),
        bodyChanged: first.changed('body'),
        previousTitle: first.previous('title'),
        previousAll: first.previous(),
      };
      first.changed('body', true);
      const forced = first.changed('body');
      first.changed('body', false);
      const cleared = first.changed('body');
      return {
        notes,
        dirty,
        forced,
        cleared,
        sameRow: first.equals(same as typeof first),
        otherRow: first.equals(other),
      };
    }));

  it('equals is false for an instance of another model', () =>
    expectSameResult(TABLES, async (lib, sequelize) => {
      const { Note, Plain } = defineModels(lib, sequelize);
      const note = await Note.create({ title: 'one' });
      const plain = await Plain.create({ label: 'one' });
      return { equal: note.equals(plain as never) };
    }));
});

describe('compat: instance and model restore', () => {
  it('instance restore runs restore hooks around the update', () =>
    expectSameResult(TABLES, async (lib, sequelize) => {
      const log: string[] = [];
      const { Note } = defineModels(lib, sequelize, log);
      const note = await Note.create({ title: 'one' });
      await note.destroy();
      const deleted = note.isSoftDeleted();
      log.length = 0;
      await note.restore();
      const hooked = [...log];
      log.length = 0;
      await note.destroy();
      await note.restore({ hooks: false });
      const silent = [...log];
      const rows = await Note.count();
      return { deleted, restored: note.isSoftDeleted(), hooked, silent, rows };
    }));

  it('restore on a model without paranoid fails', () =>
    expectSameError(TABLES, async (lib, sequelize) => {
      const { Plain } = defineModels(lib, sequelize);
      const plain = await Plain.create({ label: 'one' });
      return plain.restore();
    }));

  it('Model.restore on a model without paranoid fails', () =>
    expectSameError(TABLES, async (lib, sequelize) => {
      const { Plain } = defineModels(lib, sequelize);
      return Plain.restore({ where: { label: 'one' } });
    }));
});

describe('compat: model metadata and helpers', () => {
  it('exposes names, keys, attributes and the owning sequelize', () =>
    expectSameResult(TABLES, async (lib, sequelize) => {
      const { Note } = defineModels(lib, sequelize);
      const Audited = sequelize.define('Audited', {}, { schema: 'audit' });
      const note = Note.build({ title: 'one' });
      return {
        modelName: Note.name,
        tableName: Note.tableName,
        primaryKey: Note.primaryKeyAttribute,
        primaryKeys: Note.primaryKeyAttributes,
        attributes: Object.keys(Note.getAttributes()),
        table: Note.getTableName(),
        qualified: (({ tableName, schema, delimiter }) => ({ tableName, schema, delimiter }))(
          Audited.getTableName() as { tableName: string; schema: string; delimiter: string },
        ),
        ownedBySequelize: note.sequelize === sequelize,
        sequelizeOfModel: Note.sequelize === sequelize,
      };
    }));

  it('bulkBuild creates unsaved instances', () =>
    expectSameResult(TABLES, async (lib, sequelize) => {
      const { Note } = defineModels(lib, sequelize);
      const built = Note.bulkBuild([{ title: 'a' }, { title: 'b' }]);
      const empty = Note.bulkBuild([]);
      await built[0]?.save();
      return {
        titles: built.map((note) => note.get('title')),
        isNew: built.map((note) => note.isNewRecord),
        empty,
        stored: await Note.count(),
      };
    }));

  it('hasHooks, hasHook and runHooks use the model hooks', () =>
    expectSameResult(TABLES, async (lib, sequelize) => {
      const log: string[] = [];
      const { Note } = defineModels(lib, sequelize, log);
      Note.addHook('beforeFind', () => void log.push('beforeFind'));
      await Note.runHooks('beforeFind', {});
      return {
        has: Note.hasHooks('beforeFind'),
        hasOne: Note.hasHook('beforeFind'),
        missing: Note.hasHooks('afterBulkDestroy'),
        log,
      };
    }));
});
