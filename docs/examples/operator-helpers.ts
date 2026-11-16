import {
  DataTypes,
  Op,
  col,
  jsonbPath,
  plainToTsQuery,
  toTsVector,
  trigramDistance,
  tsHeadline,
  tsRank,
  websearchToTsQuery,
  where,
  type Sequelize,
} from 'postgrelize';

const names = (rows: readonly { get: (key: string) => unknown }[]): string =>
  rows.map((row) => String(row.get('name'))).join(',');

const expectNames = (
  rows: readonly { get: (key: string) => unknown }[],
  expected: string,
): void => {
  if (names(rows) !== expected) {
    throw new Error(`expected ${expected}, got ${names(rows)}`);
  }
};

export const run = async (sequelize: Sequelize): Promise<void> => {
  await sequelize.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
  const Doc = sequelize.define(
    'Doc',
    { name: DataTypes.TEXT, body: DataTypes.TEXT, attrs: DataTypes.JSONB, ip: DataTypes.INET },
    { timestamps: false },
  );
  await Doc.sync();
  await Doc.bulkCreate([
    { name: 'cat', body: 'The fat cats sat on the mat', attrs: { price: 5 }, ip: '10.0.0.5' },
    { name: 'dog', body: 'A dog ran home', attrs: { price: 50 }, ip: '192.168.1.9' },
  ]);
  const order: [string, string][] = [['name', 'ASC']];

  // #region similar-to
  const sqlPattern = await Doc.findAll({
    where: { name: { [Op.similarTo]: '(c|d)%' } },
    order,
  });
  // #endregion similar-to
  expectNames(sqlPattern, 'cat,dog');

  // #region jsonpath
  const exists = await Doc.findAll({
    where: { attrs: { [Op.jsonPathExists]: '$.price ? (@ > 10)' } },
  });
  const withVars = await Doc.findAll({
    where: where(
      jsonbPath('exists', col('attrs'), '$.price ? (@ < $max)', { vars: { max: 10 } }),
      true,
    ),
  });
  // #endregion jsonpath
  expectNames(exists, 'dog');
  expectNames(withVars, 'cat');

  // #region network
  const inSubnet = await Doc.findAll({ where: { ip: { [Op.containedOrEqual]: '10.0.0.0/8' } } });
  // #endregion network
  expectNames(inSubnet, 'cat');

  // #region full-text
  const vector = toTsVector(col('body'), 'english');
  const query = websearchToTsQuery('"fat cats" -dog', 'english');
  const found = await Doc.findAll({
    attributes: [
      'name',
      [tsRank(vector, query, { normalization: 1 }), 'rank'],
      [
        tsHeadline(col('body'), query, {
          config: 'english',
          options: 'StartSel=<b>, StopSel=</b>',
        }),
        'excerpt',
      ],
    ],
    where: where(vector, Op.match, query),
    order: [[tsRank(vector, query), 'DESC']],
  });
  // found[0].get('excerpt'): 'The <b>fat</b> <b>cats</b> sat on the mat'
  const anyWord = await Doc.findAll({
    where: where(vector, Op.match, plainToTsQuery('dog home', 'english')),
  });
  // #endregion full-text
  expectNames(found, 'cat');
  expectNames(anyWord, 'dog');

  // #region trigram
  const similar = await Doc.findAll({
    where: { name: { [Op.trigramSimilar]: 'dogg' } },
    order: [[trigramDistance(col('name'), 'dogg'), 'ASC']],
  });
  // #endregion trigram
  expectNames(similar, 'dog');
};
