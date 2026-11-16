import { afterEach, describe, expect, it } from 'vitest';
import { DataTypes, Op, Sequelize, cast, literal, type WhereOptions } from '../../src/index.ts';
import { testDatabaseUrl } from '../support/db-url.ts';
import { withSchema } from '../support/with-schema.ts';

// Backs the data type rows added by stage S15 in docs/coverage/postgresql-features.ts.

const opened: Sequelize[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((sequelize) => sequelize.close()));
});

const inSchema = <T>(run: (sequelize: Sequelize) => Promise<T>): Promise<T> =>
  withSchema(async ({ schema }) => {
    const sequelize = new Sequelize(testDatabaseUrl(), {
      logging: false,
      dialectOptions: { options: `-c search_path=${schema}` },
    });
    opened.push(sequelize);
    return run(sequelize);
  });

const p = (x: number, y: number): { x: number; y: number } => ({ x, y });

describe('geometric types', () => {
  it('round-trips every geometric type', () =>
    inSchema(async (sequelize) => {
      const Shape = sequelize.define(
        'Shape',
        {
          pt: DataTypes.POINT,
          ln: DataTypes.LINE,
          sg: DataTypes.LSEG,
          bx: DataTypes.BOX,
          open: DataTypes.PATH,
          closed: DataTypes.PATH,
          poly: DataTypes.POLYGON,
          disc: DataTypes.CIRCLE,
        },
        { timestamps: false },
      );
      await sequelize.sync();
      const values = {
        pt: p(1.5, -2),
        ln: { a: 1, b: -1, c: 0 },
        sg: [p(0, 0), p(3, 4)],
        bx: [p(2, 2), p(0, 0)],
        open: { points: [p(0, 0), p(1, 1), p(2, 0)], closed: false },
        closed: { points: [p(0, 0), p(1, 1), p(2, 0)], closed: true },
        poly: [p(0, 0), p(4, 0), p(4, 4), p(0, 4)],
        disc: { x: 1, y: 2, radius: 3 },
      };
      await Shape.create(values);
      const row = await Shape.findOne({ raw: true });
      expect(row).toMatchObject(values);
    }));

  it('filters with geometric operators', () =>
    inSchema(async (sequelize) => {
      const Area = sequelize.define(
        'Area',
        { name: DataTypes.STRING, box: DataTypes.BOX, at: DataTypes.POINT },
        { timestamps: false },
      );
      await sequelize.sync();
      await Area.bulkCreate([
        { name: 'a', box: [p(2, 2), p(0, 0)], at: p(1, 1) },
        { name: 'b', box: [p(12, 12), p(10, 10)], at: p(11, 11) },
      ]);
      const names = async (where: WhereOptions): Promise<string[]> =>
        (await Area.findAll({ where, order: [['name', 'ASC']] })).map(
          (a) => a.get('name') as string,
        );
      expect(await names({ box: { [Op.contains]: cast('(1,1)', 'point') } })).toEqual(['a']);
      expect(await names({ box: { [Op.overlap]: [p(11, 11), p(1, 1)] } })).toEqual(['a', 'b']);
      expect(await names({ box: { [Op.strictRight]: [p(5, 5), p(4, 4)] } })).toEqual(['b']);
      expect(await names({ at: { [Op.contained]: cast('(5,5),(0,0)', 'box') } })).toEqual(['a']);
      expect(await names({ [Op.and]: literal('at <-> point(0,0) < 2') })).toEqual(['a']);
    }));

  it('serializes geometric column defaults', () =>
    inSchema(async (sequelize) => {
      const Spot = sequelize.define(
        'Spot',
        { at: { type: DataTypes.POINT, defaultValue: p(3, 4) } },
        { timestamps: false },
      );
      await sequelize.sync();
      await Spot.create({});
      expect((await Spot.findOne())?.get('at')).toEqual(p(3, 4));
    }));
});
