import { DataTypes, Model, literal, type Sequelize } from 'postgrelize';
import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'postgrelize';

export const run = async (sequelize: Sequelize): Promise<void> => {
  // #region class
  class Product extends Model<InferAttributes<Product>, InferCreationAttributes<Product>> {
    declare id: CreationOptional<number>;
    declare sku: string;
    declare name: string;
    declare tags: CreationOptional<string[]>;
    declare attrs: CreationOptional<Record<string, unknown>>;
    declare status: CreationOptional<'draft' | 'live'>;
    declare label: CreationOptional<string>;
  }

  Product.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      sku: {
        type: DataTypes.STRING(32),
        allowNull: false,
        unique: true,
        set(this: Product, value: string) {
          this.setDataValue('sku', value.toUpperCase());
        },
      },
      name: { type: DataTypes.TEXT, allowNull: false },
      tags: { type: DataTypes.ARRAY(DataTypes.TEXT), allowNull: false, defaultValue: [] },
      attrs: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      status: { type: DataTypes.ENUM('draft', 'live'), allowNull: false, defaultValue: 'draft' },
      label: {
        type: DataTypes.VIRTUAL,
        get(this: Product) {
          return `${this.sku} ${this.name}`;
        },
      },
    },
    { sequelize, tableName: 'products', underscored: true },
  );
  // #endregion class

  // #region define
  const Order = sequelize.define(
    'Order',
    {
      number: { type: DataTypes.TEXT, allowNull: false },
      placedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    { paranoid: true },
  );
  // #endregion define

  // #region postgres-columns
  const Line = sequelize.define(
    'Line',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, identity: 'always' },
      price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      qty: { type: DataTypes.INTEGER, allowNull: false },
      total: { type: DataTypes.DECIMAL(12, 2), generated: { as: literal('"price" * "qty"') } },
      period: DataTypes.INTERVAL,
    },
    { timestamps: false },
  );
  // #endregion postgres-columns

  await sequelize.sync();

  // #region use
  const product = await Product.create({ sku: 'ab-1', name: 'Anvil', tags: ['heavy'] });
  product.attrs = { color: 'black' };
  await product.save();

  const line = await Line.create({ price: '2.50', qty: 4, period: '1 year 2 mons' });
  // line.get('id') === '1' (BIGINT is returned as a string), line.get('total') === '10.00'
  // #endregion use

  // #region overriding
  const imported = await Line.create(
    { id: '500', price: '1.00', qty: 1 },
    { overriding: 'system' },
  ); // GENERATED ALWAYS rejects an explicit id unless `overriding` says so
  // #endregion overriding
  if (imported.get('id') !== '500') {
    throw new Error('overriding: "system" did not write the explicit identity value');
  }

  // #region schema
  await sequelize.createSchema('tenant_a');
  const TenantOrder = Order.schema('tenant_a');
  await TenantOrder.sync();
  await TenantOrder.create({ number: 'T-1' });
  const tenantCount = await TenantOrder.count(); // counts "tenant_a"."Orders" only
  // #endregion schema

  // #region fields
  const partial = await Product.create(
    { sku: 'cd-2', name: 'Anchor', status: 'live' },
    { fields: ['sku', 'name'] },
  ); // `status` is not written: the column default applies; timestamps are added for you
  // #endregion fields

  const order = await Order.create({ number: 'A-1' });
  await order.destroy();
  const visible = await Order.count();
  const all = await Order.count({ paranoid: false });

  if (
    product.sku !== 'AB-1' ||
    product.label !== 'AB-1 Anvil' ||
    product.status !== 'draft' ||
    line.get('id') !== '1' ||
    line.get('total') !== '10.00' ||
    line.get('period') !== '1 year 2 mons' ||
    tenantCount !== 1 ||
    partial.status !== 'draft' ||
    visible !== 0 ||
    all !== 1
  ) {
    throw new Error('models example: unexpected result');
  }
};
