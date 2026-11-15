import { afterEach, describe, expect, it } from 'vitest';
import { DataTypes, DatabaseError, QueryTypes, Sequelize } from '../../src/index.ts';
import { testDatabaseUrl } from '../support/db-url.ts';
import { withSchema } from '../support/with-schema.ts';

const opened: Sequelize[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((sequelize) => sequelize.close()));
});

const open = (schema: string): Sequelize => {
  const sequelize = new Sequelize(testDatabaseUrl(), {
    logging: false,
    pool: { max: 1 },
    dialectOptions: { options: `-c search_path=${schema}` },
  });
  opened.push(sequelize);
  return sequelize;
};

const show = async (sequelize: Sequelize, setting: string, transaction?: unknown) => {
  const rows = (await sequelize.query(`SHOW ${setting}`, {
    type: QueryTypes.SELECT,
    ...(transaction === undefined ? {} : { transaction: transaction as never }),
  })) as Record<string, string>[];
  return Object.values(rows[0] ?? {})[0];
};

describe('deferrable transactions', () => {
  it('starts SERIALIZABLE READ ONLY DEFERRABLE and NOT DEFERRABLE', async () => {
    await withSchema(async ({ schema }) => {
      const sequelize = open(schema);
      const options = { isolationLevel: 'SERIALIZABLE', readOnly: true } as const;
      await sequelize.transaction({ ...options, deferrable: true }, async (transaction) => {
        expect(await show(sequelize, 'transaction_deferrable', transaction)).toBe('on');
      });
      await sequelize.transaction({ ...options, deferrable: false }, async (transaction) => {
        expect(await show(sequelize, 'transaction_deferrable', transaction)).toBe('off');
      });
    });
  });

  it('rejects a non-boolean deferrable before sending SQL', async () => {
    await withSchema(async ({ schema }) => {
      const sequelize = open(schema);
      await expect(sequelize.transaction({ deferrable: 'on' as never })).rejects.toThrow(
        /Invalid deferrable option/,
      );
    });
  });
});

describe('per-query statementTimeout', () => {
  it('cancels a slow query and leaves the pooled connection untouched', async () => {
    await withSchema(async ({ schema }) => {
      const sequelize = open(schema);
      const slow = sequelize.query('SELECT pg_sleep(5)', { statementTimeout: 50 });
      await expect(slow).rejects.toBeInstanceOf(DatabaseError);
      await expect(slow).rejects.toMatchObject({ original: { code: '57014' } });
      expect(await show(sequelize, 'statement_timeout')).toBe('0');
    });
  });

  it('restores the transaction timeout after the query', async () => {
    await withSchema(async ({ schema }) => {
      const sequelize = open(schema);
      await sequelize.transaction(
        { settings: { statement_timeout: '7s' } },
        async (transaction) => {
          await sequelize.query('SELECT 1', { transaction, statementTimeout: 100 });
          expect(await show(sequelize, 'statement_timeout', transaction)).toBe('7s');
        },
      );
    });
  });

  it('applies to model queries and rejects invalid values', async () => {
    await withSchema(async ({ schema }) => {
      const sequelize = open(schema);
      const Item = sequelize.define('Item', { name: DataTypes.STRING }, { schema });
      await Item.sync();
      expect(await Item.findAll({ statementTimeout: 1000 })).toEqual([]);
      for (const value of [-1, 1.5, Number.NaN]) {
        await expect(Item.findAll({ statementTimeout: value })).rejects.toThrow(
          /non-negative integer/,
        );
      }
    });
  });
});

describe('bulkCreate unnest', () => {
  it('inserts past the 65535 parameter limit with one array parameter per column', async () => {
    await withSchema(async ({ schema }) => {
      const sequelize = open(schema);
      const Item = sequelize.define(
        'Item',
        { name: DataTypes.STRING, qty: DataTypes.INTEGER, meta: DataTypes.JSONB },
        { schema },
      );
      await Item.sync();
      const rows = Array.from({ length: 30_000 }, (_, index) => ({
        name: `n${index}`,
        qty: index,
        meta: { index },
      }));
      const created = await Item.bulkCreate(rows, { unnest: true });
      expect(created).toHaveLength(30_000);
      expect(created[29_999]?.get('id')).toBe(30_000);
      expect(await Item.count()).toBe(30_000);
      const last = await Item.findOne({ where: { qty: 29_999 } });
      expect(last?.get('meta')).toEqual({ index: 29_999 });
      await expect(Item.bulkCreate(rows, { unnest: false })).rejects.toThrow(/parameters/);
    });
  });

  it('rejects conflict options and rows missing a column', async () => {
    await withSchema(async ({ schema }) => {
      const sequelize = open(schema);
      const Item = sequelize.define(
        'Item',
        { name: DataTypes.STRING, qty: DataTypes.INTEGER },
        { schema },
      );
      await Item.sync();
      await expect(
        Item.bulkCreate([{ name: 'a', qty: 1 }], { unnest: true, ignoreDuplicates: true }),
      ).rejects.toThrow(/conflict options/);
      await expect(
        Item.bulkCreate([{ name: 'a', qty: 1 }, { name: 'b' }], { unnest: true }),
      ).rejects.toThrow(/every row/);
    });
  });
});
