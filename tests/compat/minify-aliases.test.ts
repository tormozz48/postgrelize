import { describe, it } from 'vitest';
import { expectSameResult, type Lib } from '../support/compat.ts';
import { testDatabaseUrl } from '../support/db-url.ts';
import type { Sequelize } from '../../src/index.ts';

const STAMPS = `"createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()`;
const SETUP = `
  CREATE TABLE "Customers" (id SERIAL PRIMARY KEY, name TEXT, ${STAMPS});
  CREATE TABLE "Orders" (id SERIAL PRIMARY KEY, reference TEXT, "CustomerId" INTEGER, ${STAMPS});
  CREATE TABLE "Lines" (id SERIAL PRIMARY KEY, quantity INTEGER, "OrderId" INTEGER, "ProductId" INTEGER, ${STAMPS});
  CREATE TABLE "Products" (id SERIAL PRIMARY KEY, sku TEXT, ${STAMPS});
  CREATE TABLE "Tags" (id SERIAL PRIMARY KEY, label TEXT, ${STAMPS});
  CREATE TABLE "OrderTags" ("OrderId" INTEGER, "TagId" INTEGER, note TEXT, ${STAMPS}, PRIMARY KEY ("OrderId", "TagId"));
  INSERT INTO "Customers" (name) VALUES ('ann'), ('bob'), ('eve');
  INSERT INTO "Orders" (reference, "CustomerId") VALUES ('o1', 1), ('o2', 1), ('o3', 2);
  INSERT INTO "Products" (sku) VALUES ('p1'), ('p2');
  INSERT INTO "Lines" (quantity, "OrderId", "ProductId") VALUES (1, 1, 1), (2, 1, 2), (3, 2, 1), (4, 3, 2);
  INSERT INTO "Tags" (label) VALUES ('t1'), ('t2');
  INSERT INTO "OrderTags" ("OrderId", "TagId", note) VALUES (1, 1, 'n1'), (1, 2, 'n2'), (3, 2, 'n3');`;

const LONG = {
  orders: 'OrdersPlacedByTheCustomerDuringTheCurrentFinancialYear',
  lines: 'LineItemsBelongingToTheOrderThatWasPlacedByTheCustomer',
  product: 'ProductCatalogEntryDescribingTheLineItemInDetail',
  tags: 'LabelsAttachedToTheOrderByTheWarehouseTeam',
};

const connect = async (lib: Lib, sequelize: Sequelize): Promise<Sequelize> => {
  const [rows] = (await sequelize.query('SELECT current_schema() AS schema')) as unknown as [
    { schema: string }[],
  ];
  return new lib.Sequelize(testDatabaseUrl(), {
    logging: false,
    minifyAliases: true,
    dialectOptions: { options: `-c search_path=${rows[0]?.schema}` },
  } as never);
};

const defineModels = (lib: Lib, sequelize: Sequelize) => {
  const { DataTypes } = lib;
  const Customer = sequelize.define('Customer', { name: DataTypes.TEXT });
  const Order = sequelize.define('Order', { reference: DataTypes.TEXT });
  const Line = sequelize.define('Line', { quantity: DataTypes.INTEGER });
  const Product = sequelize.define('Product', { sku: DataTypes.TEXT });
  const Tag = sequelize.define('Tag', { label: DataTypes.TEXT });
  const OrderTag = sequelize.define('OrderTag', { note: DataTypes.TEXT }, { timestamps: true });
  Customer.hasMany(Order, { as: LONG.orders, foreignKey: 'CustomerId' });
  Order.belongsTo(Customer);
  Order.hasMany(Line, { as: LONG.lines, foreignKey: 'OrderId' });
  Line.belongsTo(Product, { as: LONG.product, foreignKey: 'ProductId' });
  Order.belongsToMany(Tag, {
    through: OrderTag,
    as: LONG.tags,
    foreignKey: 'OrderId',
    otherKey: 'TagId',
  });
  return { Customer, Order, Line, Product, Tag };
};

const run = (
  scenario: (models: ReturnType<typeof defineModels>, sequelize: Sequelize) => Promise<unknown>,
) =>
  expectSameResult(SETUP, async (lib, base) => {
    const sequelize = await connect(lib, base);
    try {
      return await scenario(defineModels(lib, sequelize), sequelize);
    } finally {
      await sequelize.close();
    }
  });

describe('minifyAliases matches sequelize v6', () => {
  it('maps deeply nested includes with aliases over 63 bytes back', () =>
    run(({ Customer, Order, Line, Product }) =>
      Customer.findAll({
        include: [
          {
            model: Order,
            as: LONG.orders,
            include: [
              { model: Line, as: LONG.lines, include: [{ model: Product, as: LONG.product }] },
            ],
          },
        ],
        order: [['id', 'ASC']],
      }),
    ));

  it('works with required includes and attribute lists', () =>
    run(({ Customer, Order, Line }) =>
      Customer.findAll({
        include: [
          {
            model: Order,
            as: LONG.orders,
            required: true,
            attributes: ['id', 'reference'],
            include: [{ model: Line, as: LONG.lines, required: true }],
          },
        ],
        order: [['id', 'ASC']],
      }),
    ));

  it('works through a belongsToMany junction', () =>
    run(({ Order, Tag }) =>
      Order.findAll({ include: [{ model: Tag, as: LONG.tags }], order: [['id', 'ASC']] }),
    ));

  it('works with limit (sub-query form) and findAndCountAll', () =>
    run(({ Customer, Order, Line }) =>
      Customer.findAndCountAll({
        include: [
          {
            model: Order,
            as: LONG.orders,
            include: [{ model: Line, as: LONG.lines }],
          },
        ],
        limit: 2,
        order: [['id', 'ASC']],
      }),
    ));

  it('works with a separate include and raw nested rows', async () => {
    await run(({ Customer, Order }) =>
      Customer.findAll({
        include: [{ model: Order, as: LONG.orders, separate: true }],
        order: [['id', 'ASC']],
      }),
    );
    await run(({ Order, Customer }) =>
      Order.findAll({ include: [Customer], raw: true, nest: true, order: [['id', 'ASC']] }),
    );
  });

  it('findOne with includes', () =>
    run(({ Customer, Order, Line }) =>
      Customer.findOne({
        where: { name: 'ann' },
        include: [{ model: Order, as: LONG.orders, include: [{ model: Line, as: LONG.lines }] }],
      }),
    ));
});
