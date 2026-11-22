import {
  DataTypes,
  Model,
  literal,
  type FindAndCountOptions,
  type FindOptions,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
  type Transaction,
  type WhereAttributeHash,
  type WhereAttributeHashValue,
} from '@orm';

declare const sequelize: Sequelize;
declare const transaction: Transaction;

class Invoice extends Model<InferAttributes<Invoice>, InferCreationAttributes<Invoice>> {
  declare id: number;
  declare title: string;
  declare note: string | null;
}
Invoice.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true },
    title: {
      type: DataTypes.STRING,
      // v6 types `this` as the model inside attribute getters and setters.
      get(): string {
        return String(this.getDataValue('title')).trim();
      },
      set(value: string): void {
        this.setDataValue('title', value.trim());
      },
    },
    note: DataTypes.TEXT,
  },
  { sequelize },
);

export async function consumer(): Promise<void> {
  // findByPk and findOne with rejectOnEmpty resolve to the model, not to `M | null`.
  const byKey: Invoice = await Invoice.findByPk(1, { rejectOnEmpty: true });
  const byKeyIn: Invoice = await Invoice.findByPk(1, {
    rejectOnEmpty: new Error('x'),
    transaction,
  });
  const one: Invoice = await Invoice.findOne({ where: { id: 1 }, rejectOnEmpty: true });
  const maybe: Invoice | null = await Invoice.findByPk(1);
  void [byKey, byKeyIn, one, maybe];

  // Model#reload takes the finder options.
  await byKey.reload({ include: [Invoice], paranoid: false, lock: transaction.LOCK.UPDATE });
  await byKey.reload({ attributes: ['id'], transaction });

  // Where types.
  const hash: WhereAttributeHash = { id: 1 };
  const value: WhereAttributeHashValue<string> = 'a';
  const typed: WhereAttributeHash<{ id: number }> = { id: 1 };
  void [hash, value, typed];

  // findAndCountAll accepts the count options.
  const counting: FindAndCountOptions<InferAttributes<Invoice>> = {
    where: { title: 'a' },
    distinct: true,
    col: 'id',
    group: ['title'],
  };
  await Invoice.findAndCountAll(counting);

  // replacements of the finders.
  const options: FindOptions<InferAttributes<Invoice>> = {
    where: literal('"title" = :title'),
    replacements: { title: 'a' },
  };
  await Invoice.findAll(options);
  await Invoice.findAll({ where: literal('"id" IN (?)'), replacements: [[1, 2]] });
}
