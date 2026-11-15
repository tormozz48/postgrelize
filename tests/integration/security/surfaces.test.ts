import { describe, expect, it } from 'vitest';
import { DataTypes, Op, QueryTypes, col, excluded, type Sequelize } from '../../../src/index.ts';
import { PAYLOADS, settle, withCanary } from '../../support/injection.ts';

const syntaxError = (result: unknown): boolean =>
  (result as { original?: { code?: string } } | undefined)?.original?.code === '42601';

const defineStock = async (sequelize: Sequelize) => {
  const Stock = sequelize.define(
    'Stock',
    {
      sku: { type: DataTypes.TEXT, unique: true },
      note: DataTypes.TEXT,
      meta: DataTypes.JSONB,
      qty: { type: DataTypes.INTEGER, defaultValue: 0 },
    },
    { timestamps: false },
  );
  await Stock.sync();
  return Stock;
};

const drain = async (chunks: AsyncIterable<Buffer>): Promise<string> => {
  const parts: Buffer[] = [];
  for await (const chunk of chunks) {
    parts.push(chunk);
  }
  return Buffer.concat(parts).toString('utf8');
};

describe('payloads on PostgreSQL-specific surfaces', () => {
  it('COPY FROM data and COPY TO filters keep payloads as data', () =>
    withCanary(async ({ sequelize }) => {
      const Stock = await defineStock(sequelize);
      const rows = PAYLOADS.map((payload, index) => ({
        sku: `${index}:${payload}`,
        note: payload,
        meta: { [payload]: payload },
      }));
      expect(await Stock.copyFrom(rows)).toBe(rows.length);
      const stored = await Stock.findAll({ order: [['id', 'ASC']] });
      expect(stored.map((row) => [row.get('note'), row.get('meta')])).toEqual(
        rows.map((row) => [row.note, row.meta]),
      );
      for (const payload of PAYLOADS.slice(0, 20)) {
        const csv = await drain(
          Stock.copyTo({ attributes: ['note'], where: { note: payload }, format: 'csv' }),
        );
        expect(csv.length).toBeGreaterThan(0);
      }
    }));

  it('onConflict targets, conditions and MERGE sources keep payloads as data', () =>
    withCanary(async ({ sequelize }) => {
      const Stock = await defineStock(sequelize);
      for (const payload of PAYLOADS) {
        await Stock.insert([{ sku: payload, note: payload, qty: 1 }], {
          onConflict: {
            target: ['sku'],
            action: { update: ['note', 'qty'], where: { note: { [Op.ne]: payload } } },
          },
        });
        await Stock.insert([{ sku: payload, note: 'again', qty: 2 }], {
          onConflict: { target: ['sku'], action: { update: { note: excluded('note') } } },
        });
        await Stock.merge({
          source: [{ sku: payload, qty: 5 }],
          on: { sku: col('source.sku') },
          whenMatched: { update: { qty: col('source.qty') } },
          whenNotMatched: { insert: true },
        });
      }
      const stored = await Stock.findAll({ order: [['id', 'ASC']] });
      expect(stored.map((row) => [row.get('sku'), row.get('note'), row.get('qty')])).toEqual(
        PAYLOADS.map((payload) => [payload, 'again', 5]),
      );
    }));

  it('LISTEN/NOTIFY channels and payloads, advisory lock keys and transaction settings', () =>
    withCanary(async ({ sequelize }) => {
      for (const payload of PAYLOADS.slice(0, 30)) {
        const received: (string | undefined)[] = [];
        let delivered: (() => void) | undefined;
        const arrived = new Promise<void>((resolve) => {
          delivered = resolve;
        });
        const channel = await settle(
          sequelize.listen(payload, (message) => {
            received.push(message);
            delivered?.();
          }),
        );
        expect({ payload, syntaxError: syntaxError(channel) }).toEqual({
          payload,
          syntaxError: false,
        });
        await sequelize.notify(payload, payload);
        await arrived;
        expect(typeof channel).toBe('function');
        await (channel as () => Promise<void>)();
        expect(received).toEqual([payload]);
        await sequelize.transaction(async (transaction) => {
          expect(await transaction.tryAdvisoryLock(payload)).toBe(true);
        });
        const setting = await settle(
          sequelize.transaction({ settings: { 'app.value': payload } }, (transaction) =>
            sequelize.query("SELECT current_setting('app.value') AS v", {
              type: QueryTypes.SELECT,
              plain: true,
              transaction,
            }),
          ),
        );
        expect(setting).toEqual({ v: payload });
        const name = await settle(
          sequelize.transaction({ settings: { [payload]: 'x' } }, async () => undefined),
        );
        expect({ payload, syntaxError: syntaxError(name) }).toEqual({
          payload,
          syntaxError: false,
        });
      }
    }));

  it('DDL defaults, comments, checks, partial indexes and QueryInterface names', () =>
    withCanary(async ({ sequelize, client, schema }) => {
      const queryInterface = sequelize.getQueryInterface();
      for (const [index, payload] of PAYLOADS.slice(0, 30).entries()) {
        const table = `t${index}`;
        await queryInterface.createTable(
          table,
          {
            id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
            note: { type: DataTypes.TEXT, defaultValue: payload, comment: payload },
            state: { type: DataTypes.ENUM(payload, 'other') },
          },
          { comment: payload },
        );
        await queryInterface.addColumn(table, payload, {
          type: DataTypes.TEXT,
          defaultValue: payload,
        });
        await queryInterface.addIndex(table, ['note'], {
          name: `i${index}`,
          where: { note: payload },
        });
        await queryInterface.addConstraint(table, {
          type: 'check',
          fields: ['note'],
          name: `c${index}`,
          where: { note: { [Op.ne]: `${payload}!` } },
        });
        await queryInterface.renameColumn(table, payload, `${payload}2`);
        await queryInterface.changeColumn(table, `${payload}2`, {
          type: DataTypes.TEXT,
          defaultValue: `${payload}3`,
        });
        await queryInterface.bulkInsert(table, [{ state: payload }]);
        const row = await client.query(`SELECT * FROM "${schema}"."${table}"`);
        expect(row.rows[0]).toMatchObject({
          note: payload,
          state: payload,
          [`${payload}2`]: `${payload}3`,
        });
        const description = await queryInterface.describeTable(table);
        expect(description['note']?.comment).toBe(payload);
        await queryInterface.removeColumn(table, `${payload}2`);
        await queryInterface.dropTable(table);
      }
    }));
});
