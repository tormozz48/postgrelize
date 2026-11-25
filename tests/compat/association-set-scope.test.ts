import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

type Row = { get(key: string): unknown };
type Setter = (...args: unknown[]) => Promise<unknown>;

const snapshot = async (
  model: { findAll(options: unknown): Promise<Row[]> },
  attributes: string[],
): Promise<unknown> =>
  (await model.findAll({ order: [['id', 'ASC']], paranoid: false })).map((row) =>
    attributes.map((attribute) => row.get(attribute)),
  );

describe('compat: association setters respect the association scope', () => {
  it('hasMany setX only unlinks rows of its own scope', () =>
    expectSameResult('', async (lib, sequelize) => {
      const Q = sequelize.define('Q', { title: lib.DataTypes.STRING });
      const C = sequelize.define('C', {
        body: lib.DataTypes.STRING,
        commentable: lib.DataTypes.STRING,
        cid: lib.DataTypes.INTEGER,
      });
      Q.hasMany(C, { foreignKey: 'cid', constraints: false, scope: { commentable: 'question' } });
      await sequelize.sync({ force: true });
      const q = await Q.create({ title: 'q' });
      const other = await Q.create({ title: 'other' });
      const id = q.get('id');
      const [a, b] = await C.bulkCreate([
        { body: 'a', commentable: 'question', cid: id },
        { body: 'b', commentable: 'question', cid: null },
      ] as never);
      await C.bulkCreate([
        { body: 'post', commentable: 'post', cid: id },
        { body: 'foreign', commentable: 'question', cid: other.get('id') },
      ] as never);
      const set = (q as unknown as { setCs: Setter }).setCs.bind(q);
      await set([b]);
      const afterSet = await snapshot(C, ['body', 'commentable', 'cid']);
      await set([]);
      void a;
      return { afterSet, afterClear: await snapshot(C, ['body', 'commentable', 'cid']) };
    }));

  it('hasMany setX leaves rows of other scopes and parents alone with a paranoid target', () =>
    expectSameResult('', async (lib, sequelize) => {
      const Q = sequelize.define('Q', { title: lib.DataTypes.STRING });
      const C = sequelize.define(
        'C',
        { body: lib.DataTypes.STRING, kind: lib.DataTypes.STRING },
        { paranoid: true },
      );
      Q.hasMany(C, { foreignKey: 'qid', constraints: false, scope: { kind: 'x' } });
      await sequelize.sync({ force: true });
      const q = await Q.create({ title: 'q' });
      const id = q.get('id');
      const [keep, gone] = await C.bulkCreate([
        { body: 'keep', kind: 'x', qid: id },
        { body: 'gone', kind: 'x', qid: id },
      ] as never);
      await C.bulkCreate([{ body: 'y', kind: 'y', qid: id }] as never);
      await (gone as unknown as { destroy(): Promise<void> }).destroy();
      await (q as unknown as { setCs: Setter }).setCs([keep]);
      return snapshot(C, ['body', 'kind', 'qid']);
    }));

  it('hasOne setX only replaces the row of its own scope', () =>
    expectSameResult('', async (lib, sequelize) => {
      const P = sequelize.define('P', { name: lib.DataTypes.STRING });
      const C = sequelize.define('C', { name: lib.DataTypes.STRING, kind: lib.DataTypes.STRING });
      P.hasOne(C, { as: 'main', foreignKey: 'pid', constraints: false, scope: { kind: 'main' } });
      await sequelize.sync({ force: true });
      const p = await P.create({ name: 'p' });
      const id = p.get('id');
      await C.bulkCreate([
        { name: 'unrelated', kind: 'side', pid: id },
        { name: 'old', kind: 'main', pid: id },
      ] as never);
      const fresh = await C.create({ name: 'fresh', kind: 'side' });
      await (p as unknown as { setMain: Setter }).setMain(fresh);
      const afterSet = await snapshot(C, ['name', 'kind', 'pid']);
      await (p as unknown as { setMain: Setter }).setMain(null);
      return { afterSet, afterClear: await snapshot(C, ['name', 'kind', 'pid']) };
    }));
});
