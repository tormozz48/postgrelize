import {
  DataTypes,
  Model,
  type CreationOptional,
  type FindAndCountOptions,
  type FindOptions,
  type Includeable,
  type InferAttributes,
  type InferCreationAttributes,
  type ModelStatic,
  type Optional,
  type Sequelize,
  type Transaction,
  type ProjectionAlias,
} from '@orm';

declare const sequelize: Sequelize;
declare const transaction: Transaction;

// Interface-typed attributes have no index signature (bkDepreciation.model.ts).
interface DepreciationAttributes {
  id: number;
  name: string | null;
  deletedAt: Date | null;
}
type DepreciationCreation = Optional<DepreciationAttributes, 'id' | 'deletedAt'>;

class Depreciation
  extends Model<DepreciationAttributes, DepreciationCreation>
  implements DepreciationAttributes
{
  declare id: number;
  declare name: string | null;
  declare deletedAt: Date | null;
}

Depreciation.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true },
    name: DataTypes.STRING,
    deletedAt: DataTypes.DATE,
  },
  {
    sequelize,
    name: { singular: 'depreciation', plural: 'depreciations' },
    modelName: 'Depreciation',
    tableName: 'depreciations',
    paranoid: true,
  },
);

class Account extends Model<InferAttributes<Account>, InferCreationAttributes<Account>> {
  declare id: CreationOptional<number>;
  declare title: string;
}
Account.init({ id: DataTypes.INTEGER, title: DataTypes.STRING }, { sequelize });

// A model without type arguments keeps any-typed values.
class Loose extends Model {}
const loose = new Loose();
loose.get('anything');
const dynamic: unknown = loose.dataValues.whatever;
void dynamic;

// bkDocumentTypeConfig.ts: a concrete model must satisfy ModelStatic<Model<any, any>>.
// eslint-disable-next-line typescript/no-explicit-any
type AnyModelStatic = ModelStatic<Model<any, any>>;
const config: { extensionModel: AnyModelStatic } = { extensionModel: Depreciation };
void config;
function accepts<M extends Model>(model: ModelStatic<M>): ModelStatic<M> {
  return model;
}
accepts(Account);

export async function queries(): Promise<void> {
  const include: Includeable[] = [Account, { model: Account, as: 'account', required: false }];
  const projection: ProjectionAlias = ['id', 'alias'];
  const options: FindOptions<DepreciationAttributes> = {
    where: { name: 'x' },
    include,
    attributes: ['id', projection],
    lock: transaction.LOCK.UPDATE,
    paranoid: false,
    replacements: { limit: 3 },
    transaction,
    order: [['id', 'DESC']],
    limit: 10,
  };
  const rows = await Depreciation.findAll(options);
  const first = rows[0];
  if (first !== undefined) {
    const id: number = first.id;
    void id;
  }

  // processStripeWebhook.job.ts: findOne with a row lock inside a transaction.
  const found = await Depreciation.findOne({
    where: { id: 1 },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  found?.get('name');

  const countOptions: FindAndCountOptions<DepreciationAttributes> = {
    where: { name: 'x' },
    include,
    paranoid: false,
    limit: 5,
  };
  const { count, rows: page } = await Depreciation.findAndCountAll(countOptions);
  const total: number = count;
  void total;
  void page;
  await Account.findAll({ include: [{ all: true }], lock: true, transaction });
  await Account.create({ title: 'a' }, { transaction });
  await Account.update({ title: 'b' }, { where: { id: 1 }, hooks: false, paranoid: false });
  await Account.destroy({ where: { id: 1 }, force: true });
}
