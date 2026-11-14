import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: Sequelize issues fixed upstream', () => {
  it('#13734 upsert and updateOnDuplicate target unique indexes', () =>
    expectSameResult('', async (lib, sequelize) => {
      const { DataTypes } = lib;
      const Link = sequelize.define(
        'Link',
        { subjectId: DataTypes.INTEGER, objectId: DataTypes.INTEGER, weight: DataTypes.INTEGER },
        { indexes: [{ unique: true, fields: ['subjectId', 'objectId'] }] },
      );
      await sequelize.sync();
      await Link.upsert({ subjectId: 1, objectId: 2, weight: 1 });
      await Link.upsert({ subjectId: 1, objectId: 2, weight: 5 });
      await Link.bulkCreate(
        [
          { subjectId: 1, objectId: 2, weight: 7 },
          { subjectId: 2, objectId: 3, weight: 1 },
        ],
        { updateOnDuplicate: ['weight'] },
      );
      return Link.findAll({
        attributes: ['subjectId', 'objectId', 'weight'],
        order: [['subjectId', 'ASC']],
        raw: true,
      });
    }));

  it('#10419 explicitly declared timestamp attributes', () =>
    expectSameResult('', async (lib, sequelize) => {
      const { DataTypes } = lib;
      const Event = sequelize.define('Event', {
        key: DataTypes.STRING,
        createdAt: { type: DataTypes.DATE, field: 'created_at' },
        updatedAt: { type: DataTypes.DATE, field: 'updated_at' },
      });
      await sequelize.sync();
      const created = await Event.create({ key: 'a' });
      const columns = await sequelize.query(
        `SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'Events' ORDER BY column_name`,
        { type: 'SELECT' },
      );
      return [created.get('key'), created.get('createdAt') instanceof Date, columns];
    }));

  it('#17486 upsert keeps supplied values of custom-named timestamps', () =>
    expectSameResult('', async (lib, sequelize) => {
      const { DataTypes } = lib;
      const Event = sequelize.define(
        'Event',
        { key: { type: DataTypes.STRING, unique: true } },
        { createdAt: 'created_at', updatedAt: 'updated_at' },
      );
      await sequelize.sync();
      const stamp = new Date('2020-01-01T00:00:00Z');
      await Event.upsert({ key: 'b', created_at: stamp, updated_at: stamp });
      await Event.upsert({ key: 'b', created_at: stamp, updated_at: stamp });
      const row = (await Event.findOne({ raw: true })) as Record<string, Date> | null;
      return [row?.['created_at']?.toISOString(), row?.['updated_at']?.toISOString()];
    }));
});
