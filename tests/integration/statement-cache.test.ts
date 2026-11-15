import { afterEach, describe, expect, it } from 'vitest';
import { DataTypes, QueryTypes, Sequelize } from '../../src/index.ts';
import { testDatabaseUrl } from '../support/db-url.ts';
import { withSchema } from '../support/with-schema.ts';

const opened: Sequelize[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((sequelize) => sequelize.close()));
});

const open = (schema: string, statementCache?: boolean | { max?: number }): Sequelize => {
  const sequelize = new Sequelize(testDatabaseUrl(), {
    logging: false,
    pool: { max: 1 },
    dialectOptions: { options: `-c search_path=${schema}` },
    ...(statementCache === undefined ? {} : { statementCache }),
  });
  opened.push(sequelize);
  return sequelize;
};

const prepared = async (sequelize: Sequelize): Promise<string[]> => {
  const rows = await sequelize.query(
    "SELECT name FROM pg_prepared_statements WHERE name LIKE 'pgz\\_%' AND statement NOT LIKE '%pg_prepared_statements%'",
    { type: QueryTypes.SELECT },
  );
  return (rows as { name: string }[]).map((row) => row.name);
};

describe('statementCache', () => {
  it('creates named statements only when enabled', async () => {
    await withSchema(async ({ schema }) => {
      const off = open(schema);
      await off.query('SELECT $1::int AS n', { bind: [1], type: QueryTypes.SELECT });
      expect(await prepared(off)).toEqual([]);
      const on = open(schema, true);
      await on.query('SELECT $1::int AS n', { bind: [1], type: QueryTypes.SELECT });
      await on.query('SELECT $1::int AS n', { bind: [2], type: QueryTypes.SELECT });
      expect(await prepared(on)).toHaveLength(1);
    });
  });

  it('bounds named statements per connection', async () => {
    await withSchema(async ({ schema }) => {
      const sequelize = open(schema, { max: 2 });
      for (const n of [1, 2, 3, 4]) {
        await sequelize.query(`SELECT ${n} + $1::int AS n`, { bind: [1], type: QueryTypes.SELECT });
      }
      expect(await prepared(sequelize)).toHaveLength(2);
    });
  });

  it('runs model queries and transactions through named statements', async () => {
    await withSchema(async ({ schema }) => {
      const sequelize = open(schema, true);
      const Item = sequelize.define('Item', { name: DataTypes.STRING }, { schema });
      await Item.sync();
      await sequelize.transaction(async (transaction) => {
        await Item.create({ name: 'a' }, { transaction });
      });
      const found = await Item.findOne({ where: { name: 'a' } });
      expect(found?.get('name')).toBe('a');
      expect((await prepared(sequelize)).length).toBeGreaterThan(0);
    });
  });

  it('retries outside a transaction after the result type changed', async () => {
    await withSchema(async ({ schema, client }) => {
      const sequelize = open(schema, true);
      await client.query('CREATE TABLE t (a int, b int)');
      await client.query('INSERT INTO t VALUES (1, 2)');
      const select = (): Promise<unknown> =>
        sequelize.query('SELECT * FROM t WHERE a = $1', { bind: [1], type: QueryTypes.SELECT });
      expect(await select()).toEqual([{ a: 1, b: 2 }]);
      await client.query('ALTER TABLE t ADD COLUMN c int DEFAULT 3');
      expect(await select()).toEqual([{ a: 1, b: 2, c: 3 }]);
      expect(await select()).toEqual([{ a: 1, b: 2, c: 3 }]);
    });
  });

  it('throws the stale plan error inside a transaction', async () => {
    await withSchema(async ({ schema, client }) => {
      const sequelize = open(schema, true);
      await client.query('CREATE TABLE t (a int, b int)');
      const select = (transaction?: unknown): Promise<unknown> =>
        sequelize.query('SELECT * FROM t WHERE a = $1', {
          bind: [1],
          type: QueryTypes.SELECT,
          ...(transaction === undefined ? {} : { transaction: transaction as never }),
        });
      await select();
      await client.query('ALTER TABLE t ADD COLUMN c int');
      await expect(sequelize.transaction((transaction) => select(transaction))).rejects.toThrow(
        /cached plan must not change result type/,
      );
    });
  });

  it('keeps going after a statement fails to parse', async () => {
    await withSchema(async ({ schema }) => {
      const sequelize = open(schema, true);
      await expect(
        sequelize.query('SELECT * FROM missing_table WHERE a = $1', { bind: [1] }),
      ).rejects.toThrow(/missing_table/);
      const rows = await sequelize.query('SELECT 1 AS n WHERE $1::int = 1', {
        bind: [1],
        type: QueryTypes.SELECT,
      });
      expect(rows).toEqual([{ n: 1 }]);
    });
  });
});
