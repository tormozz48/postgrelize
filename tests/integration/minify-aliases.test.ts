import { afterEach, describe, expect, it } from 'vitest';
import { DataTypes, Sequelize } from '../../src/index.ts';
import { withSchema } from '../support/with-schema.ts';
import { testDatabaseUrl } from '../support/db-url.ts';

const opened: Sequelize[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((sequelize) => sequelize.close()));
});

const LINES = 'LineItemsBelongingToTheOrderThatWasPlacedByTheCustomerOnline';
const ORDERS = 'OrdersPlacedByTheCustomerDuringTheCurrentFinancialYearOnline';
const SETUP = `
  CREATE TABLE "Customers" (id SERIAL PRIMARY KEY, name TEXT);
  CREATE TABLE "Orders" (id SERIAL PRIMARY KEY, "CustomerId" INTEGER);
  CREATE TABLE "Lines" (id SERIAL PRIMARY KEY, "OrderId" INTEGER, quantity_ordered_by_customer INTEGER, quantity_shipped_to_customer INTEGER);
  INSERT INTO "Customers" (name) VALUES ('ann');
  INSERT INTO "Orders" ("CustomerId") VALUES (1);
  INSERT INTO "Lines" ("OrderId", quantity_ordered_by_customer, quantity_shipped_to_customer) VALUES (1, 3, 2);`;

const load = async (
  minifyAliases: boolean,
): Promise<{ sql: string[]; lines: Record<string, unknown>[] }> =>
  withSchema(async ({ schema, client }) => {
    await client.query(SETUP);
    const sql: string[] = [];
    const sequelize = new Sequelize(testDatabaseUrl(), {
      logging: (text: string) => sql.push(text),
      minifyAliases,
      dialectOptions: { options: `-c search_path=${schema}` },
    });
    opened.push(sequelize);
    const Customer = sequelize.define('Customer', { name: DataTypes.TEXT }, { timestamps: false });
    const Order = sequelize.define('Order', {}, { timestamps: false });
    const Line = sequelize.define(
      'Line',
      {
        quantity_ordered_by_customer: DataTypes.INTEGER,
        quantity_shipped_to_customer: DataTypes.INTEGER,
      },
      { timestamps: false },
    );
    Customer.hasMany(Order, { as: ORDERS, foreignKey: 'CustomerId' });
    Order.hasMany(Line, { as: LINES, foreignKey: 'OrderId' });
    const customers = await Customer.findAll({
      include: [{ model: Order, as: ORDERS, include: [{ model: Line, as: LINES }] }],
      logging: (text: string) => sql.push(text),
    });
    const orders = customers[0]?.get(ORDERS) as { get: (key: string) => unknown }[];
    const lines = (orders[0]?.get(LINES) ?? []) as { get: () => Record<string, unknown> }[];
    return { sql, lines: lines.map((line) => line.get()) };
  });

describe('minifyAliases', () => {
  it('keeps columns apart whose aliases PostgreSQL would truncate to the same name', async () => {
    const minified = await load(true);
    expect(minified.lines).toEqual([
      { id: 1, OrderId: 1, quantity_ordered_by_customer: 3, quantity_shipped_to_customer: 2 },
    ]);
    expect(minified.sql.some((text) => text.includes('AS "_0"'))).toBe(true);
    expect(minified.sql.some((text) => text.includes(`${LINES}.quantity`))).toBe(false);
  });

  it('is off by default: long aliases reach PostgreSQL unchanged (and get truncated)', async () => {
    const plain = await load(false);
    expect(plain.sql.some((text) => text.includes(`${ORDERS}.${LINES}.quantity`))).toBe(true);
    expect(plain.lines).not.toEqual([
      { id: 1, OrderId: 1, quantity_ordered_by_customer: 3, quantity_shipped_to_customer: 2 },
    ]);
  });
});
