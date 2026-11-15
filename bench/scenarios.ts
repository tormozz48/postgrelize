// Scenarios shared by postgrelize and Sequelize v6 (both expose the same v6 API), so each case can
// be timed on both libraries. The library is injected; models are typed loosely on purpose.
/* oxlint-disable typescript/no-explicit-any, typescript/explicit-module-boundary-types */
export type Lib = Readonly<{ Sequelize: any; DataTypes: any; Op: any }>;
export type Case = Readonly<{ iterations: number; run: () => Promise<unknown>; rows?: number }>;
export type Scenario = Readonly<{
  cases: Readonly<Record<string, Case>>;
  sequelize: any;
  setup: () => Promise<void>;
}>;

const LARGE = 10_000;

const defineModels = (sequelize: any, { DataTypes }: Lib): Record<string, any> => {
  const Item = sequelize.define('Item', {
    sku: { type: DataTypes.STRING, unique: true },
    qty: DataTypes.INTEGER,
    meta: DataTypes.JSONB,
  });
  const Author = sequelize.define('Author', { name: DataTypes.STRING });
  const Post = sequelize.define('Post', { title: DataTypes.STRING, qty: DataTypes.INTEGER });
  const Tag = sequelize.define('Tag', { name: DataTypes.STRING });
  Author.hasMany(Post, { foreignKey: 'authorId' });
  Post.belongsTo(Author, { foreignKey: 'authorId' });
  Post.belongsToMany(Tag, { through: 'PostTags', foreignKey: 'postId', otherKey: 'tagId' });
  Tag.belongsToMany(Post, { through: 'PostTags', foreignKey: 'tagId', otherKey: 'postId' });
  return { Item, Author, Post, Tag };
};

const seed = async (sequelize: any, models: Record<string, any>): Promise<void> => {
  const { Item, Author, Post, Tag } = models;
  await sequelize.sync();
  const items = Array.from({ length: LARGE }, (_, index) => ({
    sku: `s${index}`,
    qty: index,
    meta: { index },
  }));
  for (let at = 0; at < items.length; at += 1000) {
    await Item.bulkCreate(items.slice(at, at + 1000));
  }
  await Author.bulkCreate(Array.from({ length: 50 }, (_, index) => ({ name: `a${index}` })));
  await Tag.bulkCreate(Array.from({ length: 20 }, (_, index) => ({ name: `t${index}` })));
  await Post.bulkCreate(
    Array.from({ length: 500 }, (_, index) => ({
      title: `p${index}`,
      qty: index,
      authorId: (index % 50) + 1,
    })),
  );
  const [posts, tags] = await Promise.all([Post.findAll(), Tag.findAll()]);
  await Promise.all(posts.map((post: any, index: number) => post.addTags([tags[index % 20]])));
};

const nestedWhere = (Op: any): Record<string, unknown> => ({
  [Op.and]: [
    { qty: { [Op.gte]: 1 } },
    { [Op.or]: [{ sku: { [Op.like]: 's1%' } }, { qty: { [Op.between]: [5, 50] } }] },
    { 'meta.index': { [Op.gt]: 5 } },
    { [Op.not]: { qty: { [Op.in]: [7, 8, 9] } } },
  ],
});

const readCases = (models: Record<string, any>, lib: Lib): Record<string, Case> => {
  const { Item, Author, Post } = models;
  const { Op } = lib;
  const ids = Array.from({ length: 5000 }, (_, index) => index + 1);
  return {
    'findAll 100 rows': {
      iterations: 200,
      run: () => Item.findAll({ limit: 100, order: [['id', 'ASC']] }),
      rows: 100,
    },
    findByPk: { iterations: 1000, run: () => Item.findByPk(500) },
    'count where': {
      iterations: 1000,
      run: () => Item.count({ where: { qty: { [Op.gte]: 10 } } }),
    },
    'findAll include belongsTo': {
      iterations: 200,
      run: () => Post.findAll({ include: [Author], limit: 50 }),
      rows: 50,
    },
    'findAll include hasMany': {
      iterations: 100,
      run: () => Author.findAll({ include: [Post], limit: 20 }),
      rows: 20,
    },
    'findAll include belongsToMany': {
      iterations: 100,
      run: () => Post.findAll({ include: [models['Tag']], limit: 20 }),
      rows: 20,
    },
    findAndCountAll: {
      iterations: 300,
      run: () => Item.findAndCountAll({ where: { qty: { [Op.gte]: 10 } }, limit: 50 }),
      rows: 50,
    },
    'where nested ops + json path': {
      iterations: 500,
      run: () => Item.findAll({ where: nestedWhere(Op), limit: 10 }),
      rows: 10,
    },
    'where Op.in 5000': {
      iterations: 50,
      run: () => Item.findAll({ where: { id: { [Op.in]: ids } }, limit: 1 }),
    },
    [`findAll ${LARGE} rows`]: {
      iterations: 5,
      run: () => Item.findAll({ limit: LARGE, order: [['id', 'ASC']] }),
      rows: LARGE,
    },
    [`findAll ${LARGE} rows raw`]: {
      iterations: 10,
      run: () => Item.findAll({ limit: LARGE, order: [['id', 'ASC']], raw: true }),
      rows: LARGE,
    },
  };
};

const writeCases = (sequelize: any, models: Record<string, any>): Record<string, Case> => {
  const { Item } = models;
  let counter = 0;
  const bulk = (size: number): Array<Record<string, unknown>> =>
    Array.from({ length: size }, () => ({ sku: `b${(counter += 1)}`, qty: 2 }));
  const instance = Item.build({ id: 7, sku: 's6', qty: 7 }, { isNewRecord: false });
  return {
    create: { iterations: 500, run: () => Item.create({ sku: `c${(counter += 1)}`, qty: 1 }) },
    'bulkCreate 100': { iterations: 50, run: () => Item.bulkCreate(bulk(100)) },
    'bulkCreate 1000': { iterations: 10, run: () => Item.bulkCreate(bulk(1000)) },
    'insert onConflict 50': {
      iterations: 100,
      // Model.insert is postgrelize-only; v6 has updateOnDuplicate for the same upsert.
      run: () => {
        const rows = Array.from({ length: 50 }, (_, index) => ({ sku: `s${index}`, qty: index }));
        return typeof Item.insert === 'function'
          ? Item.insert(rows, { onConflict: { target: ['sku'], action: { update: ['qty'] } } })
          : Item.bulkCreate(rows, { updateOnDuplicate: ['qty'] });
      },
    },
    'update instance (save)': {
      iterations: 500,
      run: () => {
        instance.qty = counter += 1;
        return instance.save();
      },
    },
    'transaction + update': {
      iterations: 300,
      run: () =>
        sequelize.transaction((transaction: any) =>
          Item.update({ qty: 3 }, { where: { sku: 's1' }, transaction }),
        ),
    },
    'transaction 3 queries': {
      iterations: 200,
      run: () =>
        sequelize.transaction(async (transaction: any) => {
          await Item.findByPk(1, { transaction });
          await Item.update({ qty: 3 }, { where: { sku: 's1' }, transaction });
          return Item.count({ transaction });
        }),
    },
  };
};

const pureCases = (sequelize: any, models: Record<string, any>, lib: Lib): Record<string, Case> => {
  const { Item } = models;
  let defined = 0;
  return {
    'build + toJSON': {
      iterations: 2000,
      run: () =>
        Promise.resolve(
          Item.build({ id: 1, sku: 'x', qty: 2, meta: { a: 1 }, createdAt: new Date(0) }).toJSON(),
        ),
    },
    'model define': {
      iterations: 200,
      run: () => {
        sequelize.define(`Defined${(defined += 1)}`, {
          name: lib.DataTypes.STRING,
          qty: { type: lib.DataTypes.INTEGER, defaultValue: 0 },
          meta: lib.DataTypes.JSONB,
        });
        return Promise.resolve();
      },
    },
  };
};

export const createScenario = (lib: Lib, url: string, schema: string, stub: boolean): Scenario => {
  const sequelize = new lib.Sequelize(url, {
    logging: false,
    pool: { max: 5 },
    dialectOptions: { options: `-c search_path=${schema}` },
  });
  const models = defineModels(sequelize, lib);
  return {
    sequelize,
    setup: async () => (stub ? undefined : seed(sequelize, models)),
    cases: {
      ...readCases(models, lib),
      ...writeCases(sequelize, models),
      ...pureCases(sequelize, models, lib),
    },
  };
};
