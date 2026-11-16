import { afterEach, describe, expect, it } from 'vitest';
import {
  DataTypes,
  Op,
  Sequelize,
  col,
  jsonbPath,
  phraseToTsQuery,
  plainToTsQuery,
  setWeight,
  toTsQuery,
  toTsVector,
  trigramDistance,
  trigramSimilarity,
  trigramWordSimilarity,
  tsHeadline,
  tsRank,
  websearchToTsQuery,
  where,
  literal,
} from '../../src/index.ts';
import { testDatabaseUrl } from '../support/db-url.ts';
import { withSchema } from '../support/with-schema.ts';
import { registerFileDatabase } from '../support/file-database-hooks.ts';

// pg_trgm is database-wide: parallel files would collide in a shared database.
registerFileDatabase();

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

const names = async (found: Promise<readonly { get(key: string): unknown }[]>) =>
  (await found).map((row) => row.get('name'));

describe('S17 operator helpers', () => {
  it('matches SQL regular expressions with Op.similarTo and Op.notSimilarTo', () =>
    inSchema(async (sequelize) => {
      const Item = sequelize.define('Item', { name: DataTypes.TEXT }, { timestamps: false });
      await Item.sync();
      await Item.bulkCreate([{ name: 'abc' }, { name: 'abd' }, { name: 'xyz' }]);
      const order: [string, string][] = [['name', 'ASC']];
      expect(
        await names(Item.findAll({ where: { name: { [Op.similarTo]: 'ab(c|d)' } }, order })),
      ).toEqual(['abc', 'abd']);
      expect(
        await names(Item.findAll({ where: { name: { [Op.notSimilarTo]: 'ab%' } }, order })),
      ).toEqual(['xyz']);
    }));

  it('filters jsonb with jsonpath operators and jsonb_path_* helpers', () =>
    inSchema(async (sequelize) => {
      const Item = sequelize.define(
        'Item',
        { name: DataTypes.TEXT, attrs: DataTypes.JSONB },
        { timestamps: false },
      );
      await Item.sync();
      await Item.bulkCreate([
        { name: 'cheap', attrs: { price: 5, tags: ['a'] } },
        { name: 'dear', attrs: { price: 50, tags: ['b', 'c'] } },
      ]);
      expect(
        await names(Item.findAll({ where: { attrs: { [Op.jsonPathExists]: '$.tags[1]' } } })),
      ).toEqual(['dear']);
      expect(
        await names(Item.findAll({ where: where(col('attrs'), Op.match, '$.price > 10') })),
      ).toEqual(['dear']);
      const expensive = jsonbPath('exists', col('attrs'), '$.price ? (@ > $min)', {
        vars: { min: 10 },
      });
      expect(await names(Item.findAll({ where: where(expensive, true) }))).toEqual(['dear']);
      const [row] = await Item.findAll({
        attributes: [
          'name',
          [jsonbPath('queryFirst', col('attrs'), '$.price'), 'price'],
          [jsonbPath('queryArray', col('attrs'), '$.tags[*]', { silent: true }), 'tags'],
          [jsonbPath('match', col('attrs'), '$.price > 10', { tz: true }), 'dear'],
        ],
        where: { name: 'dear' },
        raw: true,
      });
      expect(row).toMatchObject({ price: 50, tags: ['b', 'c'], dear: true });
      expect(
        await Item.count({
          where: where(jsonbPath('exists', col('attrs'), '$.nope', { silent: true }), true),
        }),
      ).toBe(0);
    }));

  it('filters inet and cidr with subnet operators', () =>
    inSchema(async (sequelize) => {
      const Host = sequelize.define(
        'Host',
        { name: DataTypes.TEXT, ip: DataTypes.INET, net: DataTypes.CIDR },
        { timestamps: false },
      );
      await Host.sync();
      await Host.bulkCreate([
        { name: 'a', ip: '10.0.0.5', net: '10.0.0.0/24' },
        { name: 'b', ip: '10.0.1.5', net: '10.0.1.0/24' },
        { name: 'c', ip: '192.168.0.1', net: '192.168.0.0/16' },
      ]);
      const order: [string, string][] = [['name', 'ASC']];
      const find = (condition: Record<string | symbol, unknown>) =>
        names(Host.findAll({ where: condition, order }));
      expect(await find({ ip: { [Op.strictLeft]: '10.0.0.0/16' } })).toEqual(['a', 'b']);
      expect(await find({ ip: { [Op.containedOrEqual]: '10.0.0.0/24' } })).toEqual(['a']);
      expect(await find({ net: { [Op.containedOrEqual]: '10.0.0.0/24' } })).toEqual(['a']);
      expect(await find({ net: { [Op.containsOrEqual]: '10.0.0.0/24' } })).toEqual(['a']);
      expect(await find({ net: { [Op.strictRight]: '10.0.1.5' } })).toEqual(['b']);
      expect(await find({ net: { [Op.containsOrEqual]: '192.168.5.0/24' } })).toEqual(['c']);
      expect(await find({ net: { [Op.overlap]: '10.0.0.0/8' } })).toEqual(['a', 'b']);
    }));

  it('searches, ranks and highlights text', () =>
    inSchema(async (sequelize) => {
      const Doc = sequelize.define(
        'Doc',
        { name: DataTypes.TEXT, body: DataTypes.TEXT },
        { timestamps: false },
      );
      await Doc.sync();
      await Doc.bulkCreate([
        { name: 'one', body: 'The fat cats sat on the mat' },
        { name: 'two', body: 'A dog ran. Cat or dog, who knows' },
        { name: 'three', body: 'Nothing here' },
      ]);
      const vector = toTsVector(col('body'), 'english');
      const search = (query: unknown) =>
        names(Doc.findAll({ where: where(vector, Op.match, query), order: [['name', 'ASC']] }));
      expect(await search(websearchToTsQuery('cat -dog', 'english'))).toEqual(['one']);
      expect(await search(websearchToTsQuery('"fat cats"', 'english'))).toEqual(['one']);
      expect(await search(plainToTsQuery('cat dog', 'english'))).toEqual(['two']);
      expect(await search(phraseToTsQuery('fat cat', 'english'))).toEqual(['one']);
      expect(await search(toTsQuery('cat | dog', 'english'))).toEqual(['one', 'two']);
      expect(await search(plainToTsQuery('CATS'))).toEqual(['one', 'two']);
      const query = websearchToTsQuery('cat', 'english');
      const ranked = await Doc.findAll({
        attributes: [
          'name',
          [tsRank(vector, query, { normalization: 1 }), 'rank'],
          [tsRank(vector, query, { cd: true, weights: [0.1, 0.2, 0.4, 1] }), 'cd'],
        ],
        where: where(vector, Op.match, query),
        order: [
          [tsRank(vector, query), 'DESC'],
          ['name', 'ASC'],
        ],
        raw: true,
      });
      expect(ranked.map((row) => (row as unknown as { name: string }).name)).toHaveLength(2);
      const [headline] = await Doc.findAll({
        attributes: [
          [
            tsHeadline(col('body'), query, {
              config: 'english',
              options: 'StartSel=<b>, StopSel=</b>',
            }),
            'excerpt',
          ],
        ],
        where: { name: 'one' },
        raw: true,
      });
      expect(headline).toMatchObject({ excerpt: 'The fat <b>cats</b> sat on the mat' });
      const [weighted] = await Doc.findAll({
        attributes: [
          [literal("setweight(to_tsvector('simple', 'a'), 'A')::text"), 'plain'],
          [setWeight(toTsVector(col('name'), 'simple'), 'B'), 'weighted'],
        ],
        where: { name: 'one' },
        raw: true,
      });
      expect(weighted).toMatchObject({ weighted: "'one':1B" });
    }));

  it('filters and orders by pg_trgm similarity', () =>
    inSchema(async (sequelize) => {
      await sequelize.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
      const User = sequelize.define('User', { name: DataTypes.TEXT }, { timestamps: false });
      await User.sync();
      await User.bulkCreate([{ name: 'Jonathan' }, { name: 'Jon' }, { name: 'Mary' }]);
      expect(
        await names(
          User.findAll({
            where: { name: { [Op.trigramSimilar]: 'Jonn' } },
            order: [['name', 'ASC']],
          }),
        ),
      ).toEqual(['Jon']);
      expect(
        await names(
          User.findAll({
            where: { name: { [Op.trigramWordSimilar]: 'Jonathon' } },
            order: [['name', 'ASC']],
          }),
        ),
      ).toEqual(['Jon', 'Jonathan']);
      expect(
        await names(
          User.findAll({
            where: { name: { [Op.trigramHasSimilarWord]: 'Jonathon' } },
            order: [['name', 'ASC']],
          }),
        ),
      ).toEqual(['Jonathan']);
      expect(
        await names(User.findAll({ where: { name: { [Op.trigramStrictWordSimilar]: 'Mary' } } })),
      ).toEqual(['Mary']);
      expect(
        await names(
          User.findAll({ where: where(trigramSimilarity(col('name'), 'jon'), Op.gt, 0.5) }),
        ),
      ).toEqual(['Jon']);
      expect(
        await names(
          User.findAll({
            where: where(trigramWordSimilarity('athan', col('name')), Op.gt, 0.5),
            order: [['name', 'ASC']],
          }),
        ),
      ).toEqual(['Jonathan']);
      expect(
        await names(
          User.findAll({ order: [[trigramDistance(col('name'), 'Jonathan'), 'ASC']], limit: 2 }),
        ),
      ).toEqual(['Jonathan', 'Jon']);
    }));
});
