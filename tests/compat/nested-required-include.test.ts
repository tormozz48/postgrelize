import { describe, it } from 'vitest';
import { expectSameResult, type Lib } from '../support/compat.ts';
import type { Sequelize } from '../../src/index.ts';

const TABLES = `
  CREATE TABLE "Ts" (id SERIAL PRIMARY KEY, name TEXT, "createdAt" TIMESTAMPTZ DEFAULT now(), "updatedAt" TIMESTAMPTZ DEFAULT now());
  CREATE TABLE "Fs" (id SERIAL PRIMARY KEY, "tId" INTEGER, "invId" INTEGER, "createdAt" TIMESTAMPTZ DEFAULT now(), "updatedAt" TIMESTAMPTZ DEFAULT now());
  CREATE TABLE "Is" (id SERIAL PRIMARY KEY, status TEXT, "gId" INTEGER, "createdAt" TIMESTAMPTZ DEFAULT now(), "updatedAt" TIMESTAMPTZ DEFAULT now());
  CREATE TABLE "Gs" (id SERIAL PRIMARY KEY, label TEXT, "createdAt" TIMESTAMPTZ DEFAULT now(), "updatedAt" TIMESTAMPTZ DEFAULT now());
  INSERT INTO "Ts" (id, name) VALUES (1,'no fee'),(2,'open'),(3,'voided'),(4,'two fees');
  INSERT INTO "Gs" (id, label) VALUES (1,'g1'),(2,'g2');
  INSERT INTO "Is" (id, status, "gId") VALUES (1,'open',1),(2,'voided',2),(3,'open',NULL);
  INSERT INTO "Fs" (id, "tId", "invId") VALUES (1,2,1),(2,3,2),(3,4,1);
`;

const models = (lib: Lib, sequelize: Sequelize) => {
  const T = sequelize.define('T', { name: lib.DataTypes.STRING });
  const F = sequelize.define('F', {});
  const I = sequelize.define('I', { status: lib.DataTypes.STRING });
  const G = sequelize.define('G', { label: lib.DataTypes.STRING });
  const fee = T.hasOne(F, { as: 'fee', foreignKey: 'tId' });
  const fees = T.hasMany(F, { as: 'fees', foreignKey: 'tId' });
  const inv = F.belongsTo(I, { as: 'inv', foreignKey: 'invId' });
  const invs = I.hasMany(F, { as: 'fs', foreignKey: 'invId' });
  const grp = I.belongsTo(G, { as: 'grp', foreignKey: 'gId' });
  const invsM = T.belongsToMany(I, {
    through: F,
    as: 'invsM',
    foreignKey: 'tId',
    otherKey: 'invId',
  });
  return { T, F, I, G, fee, fees, inv, invs, grp, invsM, Op: lib.Op };
};

const ids = (rows: readonly { get: (key: string) => unknown }[]): unknown[] =>
  rows.map((row) => row.get('id')).toSorted();

const run = (scenario: (m: ReturnType<typeof models>) => Promise<unknown>): Promise<unknown> =>
  expectSameResult(TABLES, async (lib, sequelize) => scenario(models(lib, sequelize)));

describe('compat: required include nested under an optional parent (v6 generateInclude)', () => {
  it('hasOne parent, required child with where', () =>
    run(async ({ T, fee, inv, Op }) =>
      ids(
        await T.findAll({
          where: { id: [1, 2, 3] },
          include: [
            {
              association: fee,
              include: [
                { association: inv, where: { status: { [Op.ne]: 'voided' } }, required: true },
              ],
            },
          ],
        }),
      ),
    ));

  it('hasOne parent, required child without where', () =>
    run(async ({ T, fee, inv }) =>
      ids(
        await T.findAll({
          include: [{ association: fee, include: [{ association: inv, required: true }] }],
        }),
      ),
    ));

  it('hasMany parent keeps the same rows and nests the children', () =>
    run(async ({ T, fees, inv, Op }) => {
      const rows = await T.findAll({
        order: [['id', 'ASC']],
        include: [
          {
            association: fees,
            include: [
              { association: inv, where: { status: { [Op.ne]: 'voided' } }, required: true },
            ],
          },
        ],
      });
      return rows.map((row) => row.toJSON());
    }));

  it('belongsTo parent', () =>
    run(async ({ F, inv, grp, Op }) =>
      ids(
        await F.findAll({
          include: [
            {
              association: inv,
              required: false,
              include: [{ association: grp, where: { label: { [Op.ne]: 'g2' } }, required: true }],
            },
          ],
        }),
      ),
    ));

  it('three levels deep', () =>
    run(async ({ T, fee, inv, grp }) =>
      ids(
        await T.findAll({
          include: [
            {
              association: fee,
              include: [
                {
                  association: inv,
                  required: false,
                  include: [{ association: grp, required: true }],
                },
              ],
            },
          ],
        }),
      ),
    ));

  it('required parent keeps the inner join (no nesting)', () =>
    run(async ({ T, fee, inv }) =>
      ids(
        await T.findAll({
          include: [
            { association: fee, required: true, include: [{ association: inv, required: true }] },
          ],
        }),
      ),
    ));

  it('optional sibling next to the required child', () =>
    run(async ({ T, fee, inv, grp }) => {
      const rows = await T.findAll({
        order: [['id', 'ASC']],
        include: [
          {
            association: fee,
            include: [
              {
                association: inv,
                required: true,
                include: [{ association: grp, required: false }],
              },
            ],
          },
        ],
      });
      return rows.map((row) => row.toJSON());
    }));

  it('limit with a hasMany parent (sub query)', () =>
    run(async ({ T, fees, inv, Op }) => {
      const rows = await T.findAll({
        order: [['id', 'ASC']],
        limit: 3,
        include: [
          {
            association: fees,
            include: [
              { association: inv, where: { status: { [Op.ne]: 'voided' } }, required: true },
            ],
          },
        ],
      });
      return rows.map((row) => row.toJSON());
    }));

  it('limit with a hasOne parent', () =>
    run(async ({ T, fee, inv }) => {
      const rows = await T.findAll({
        order: [['id', 'ASC']],
        limit: 3,
        include: [{ association: fee, include: [{ association: inv, required: true }] }],
      });
      return rows.map((row) => row.toJSON());
    }));

  it('count and findAndCountAll', () =>
    run(async ({ T, fee, inv }) => {
      const include = [{ association: fee, include: [{ association: inv, required: true }] }];
      const counted = await T.findAndCountAll({ include, distinct: true });
      return { rows: ids(counted.rows), count: counted.count };
    }));

  it('belongsToMany parent', () =>
    run(async ({ T, invsM, grp }) => {
      const rows = await T.findAll({
        order: [['id', 'ASC']],
        include: [
          {
            association: invsM,
            through: { attributes: [] },
            include: [{ association: grp, required: true }],
          },
        ],
      });
      return rows.map((row) => row.toJSON());
    }));

  it('hasMany chain three levels deep with limit', () =>
    run(async ({ T, fees, inv, grp }) => {
      const rows = await T.findAll({
        order: [['id', 'ASC']],
        limit: 4,
        include: [
          {
            association: fees,
            include: [
              {
                association: inv,
                required: false,
                include: [{ association: grp, required: true }],
              },
            ],
          },
        ],
      });
      return rows.map((row) => row.toJSON());
    }));
});
