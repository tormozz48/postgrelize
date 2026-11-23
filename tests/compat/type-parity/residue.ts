import {
  DataTypes,
  fn,
  col,
  literal,
  where,
  Model,
  Op,
  QueryTypes,
  type CreationAttributes,
  type FindOptions,
  type InferAttributes,
  type InferCreationAttributes,
  type ModelStatic,
  type Order,
  type Sequelize,
  type Transaction,
  type WhereOptions,
} from '@orm';

declare const sequelize: Sequelize;
declare const transaction: Transaction;

class Ledger extends Model<InferAttributes<Ledger>, InferCreationAttributes<Ledger>> {
  declare id: number;
  declare name: string;
  declare parentId: number | null;
  declare amount: number;

  async isLeaf(): Promise<boolean> {
    const rows = await this.sequelize.query('select 1', { type: QueryTypes.SELECT });
    return rows.length === 0;
  }
}

Ledger.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true },
    name: DataTypes.STRING,
    parentId: DataTypes.INTEGER,
    amount: DataTypes.DECIMAL(10, 2),
  },
  {
    sequelize,
    validate: {
      // Model-level validators: sync, async and callback style, with a typed `this`.
      mustBeBalanced(this: Ledger): void {
        if (this.amount < 0) {
          throw new Error('negative');
        }
      },
      async checkParent(this: Ledger): Promise<void> {
        await Promise.resolve(this.parentId);
      },
      legacy(this: Ledger, next: (error?: string) => void): void {
        next();
      },
    },
  },
);

export async function residue(): Promise<void> {
  // The sequelize instance of a model and of an instance is a Sequelize.
  await Ledger.sequelize!.query('select 1');
  await Ledger.sequelize?.transaction(async (t) => {
    await Ledger.findAll({ transaction: t });
  });
  const model = new Ledger();
  const same: Sequelize = model.sequelize;
  void same;

  // Casts a v6 application writes.
  const asStatic = Ledger as ModelStatic<Model>;
  const asModel = model as Model;
  const asAny = model as Model<InferAttributes<Ledger>, CreationAttributes<Ledger>>;
  const named = sequelize.models.Ledger as ModelStatic<Ledger>;
  const generic = sequelize.models.Ledger as unknown as typeof Ledger;
  void [asStatic, asModel, asAny, named, generic];

  // Finder shapes.
  const order: Order = [
    [fn('lower', col('name')), 'ASC'],
    [literal('"amount"'), 'DESC'],
    ['id', 'ASC'],
  ];
  const pushed: Order = [];
  pushed.push(['id', 'ASC']);
  void pushed;
  const filter: WhereOptions<InferAttributes<Ledger>> = {
    [Op.and]: [{ name: { [Op.like]: 'a%' } }, where(fn('lower', col('name')), 'a')],
    parentId: { [Op.or]: [null, { [Op.gt]: 1 }] },
  };
  const options: FindOptions<InferAttributes<Ledger>> = {
    where: filter,
    order,
    attributes: { include: [[fn('sum', col('amount')), 'total']], exclude: ['name'] },
    group: ['id'],
    raw: true,
    logging: false,
  };
  await Ledger.findAll(options);
  await Ledger.findAll({
    where: { id: [1, 2, 3] },
    include: [{ model: Ledger, as: 'children', where: { id: 1 }, required: false }],
  });
  await Ledger.findOne({ where: { id: 1 }, order: [['id', 'DESC']], transaction });
  await Ledger.findAndCountAll({ where: { name: 'a' }, limit: 5, offset: 5, order });
  await Ledger.count({ where: { name: 'a' }, distinct: true, col: 'id' });
  await Ledger.max('amount', { where: { id: 1 } });
  await Ledger.sum('amount', { where: { name: 'a' }, transaction });
  await Ledger.create(
    { id: 1, name: 'a', parentId: null, amount: 1 },
    { transaction, returning: true },
  );
  await Ledger.bulkCreate([{ id: 1, name: 'a', parentId: null, amount: 1 }], {
    validate: true,
    ignoreDuplicates: true,
  });
  await Ledger.update({ name: 'b' }, { where: { id: 1 }, transaction, returning: true });
  await Ledger.destroy({ where: { id: 1 }, transaction });
  await Ledger.findOrCreate({
    where: { id: 1 },
    defaults: { id: 1, name: 'a', amount: 1 },
    transaction,
  });
  await Ledger.upsert({ id: 1, name: 'a', parentId: null, amount: 1 }, { transaction });
  await model.update({ name: 'c' }, { transaction });
  await model.save({ transaction, fields: ['name'] });
  await model.increment('amount', { by: 2, transaction });
  await model.destroy({ force: true, transaction });
  await model.validate();
}
