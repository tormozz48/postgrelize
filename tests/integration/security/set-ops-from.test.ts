import { describe, expect, it } from 'vitest';
import { DataTypes, Op, type Sequelize } from '../../../src/index.ts';
import { PAYLOADS, withCanary } from '../../support/injection.ts';

const defineNote = async (sequelize: Sequelize) => {
  const Note = sequelize.define('Note', { body: DataTypes.TEXT }, { timestamps: false });
  await Note.sync();
  return Note;
};

describe('payloads in set operations and WITH TIES', () => {
  it('values inside operands of UNION / INTERSECT / EXCEPT stay bound', () =>
    withCanary(async ({ sequelize }) => {
      const Note = await defineNote(sequelize);
      await Note.bulkCreate(PAYLOADS.map((body) => ({ body })));
      for (const payload of PAYLOADS) {
        const equal = Note.subquery({ attributes: ['id'], where: { body: payload } });
        const other = Note.subquery({ attributes: ['id'], where: { body: { [Op.ne]: payload } } });
        expect(await Note.count({ source: equal.union(other) })).toBe(PAYLOADS.length);
        expect(await Note.count({ source: equal.intersect(other) })).toBe(0);
        expect(await Note.count({ source: equal.except(other) })).toBe(1);
      }
    }));

  it('WITH TIES keeps the fetch count bound', () =>
    withCanary(async ({ sequelize }) => {
      const Note = await defineNote(sequelize);
      await Note.bulkCreate(PAYLOADS.map((body) => ({ body })));
      const rows = await Note.findAll({
        where: { body: { [Op.in]: PAYLOADS } },
        order: [['id', 'ASC']],
        limit: 2,
        withTies: true,
      });
      expect(rows).toHaveLength(2);
    }));
});
