import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

// Gaps found by running Sequelize v6's own test suite against postgrelize
// (.10x/specs/2026-11-22-v6-compat-gate-design.md).
describe('compat: v6 runtime gaps', () => {
  it('ValidationError#get returns the items of one attribute', () =>
    expectSameResult('', async (lib, sequelize) => {
      const M = sequelize.define('M', {
        a: { type: lib.DataTypes.STRING, allowNull: false },
        b: { type: lib.DataTypes.STRING, allowNull: false },
      });
      try {
        await M.build({}).validate();
      } catch (error) {
        const e = error as InstanceType<typeof lib.ValidationError>;
        return { a: e.get('a').map((item) => item.message), none: e.get('zz') };
      }
      return 'no error';
    }));

  it('define without attributes gives a model with an id and timestamps', () =>
    expectSameResult('', async (_lib, sequelize) => {
      const M = sequelize.define('Plain');
      await M.sync({ force: true });
      const row = await M.create({});
      return { attributes: Object.keys(M.getAttributes()), created: row.get('id') !== undefined };
    }));

  it('BelongsTo#get loads several sources keyed by foreign key', () =>
    expectSameResult('', async (lib, sequelize) => {
      const A = sequelize.define('A', { name: lib.DataTypes.STRING });
      const B = sequelize.define('B', { name: lib.DataTypes.STRING });
      const association = B.belongsTo(A) as unknown as {
        get: (
          instances: unknown[],
        ) => Promise<Record<string, { get: (k: string) => unknown } | null>>;
      };
      await sequelize.sync({ force: true });
      const a = await A.create({ name: 'x' });
      const b1 = await B.create({ name: 'b1', AId: a.get('id') });
      const b2 = await B.create({ name: 'b2' });
      const found = await association.get([b1, b2]);
      return Object.fromEntries(
        Object.entries(found).map(([key, row]) => [key, row?.get('name') ?? null]),
      );
    }));

  it('references.model accepts a model class', () =>
    expectSameResult('', async (lib, sequelize) => {
      const P = sequelize.define('P', { name: lib.DataTypes.STRING });
      const C = sequelize.define('C', {
        pid: { type: lib.DataTypes.INTEGER, references: { model: P, key: 'id' } },
      });
      await sequelize.sync({ force: true });
      const p = await P.create({ name: 'x' });
      const c = await C.create({ pid: p.get('id') });
      const rejected = await C.create({ pid: 999 }).then(
        () => false,
        (error: Error) => error.name,
      );
      return { pid: c.get('pid'), rejected };
    }));
});
