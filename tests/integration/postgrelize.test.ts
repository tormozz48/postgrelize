import { afterEach, describe, expect, it } from 'vitest';
import {
  ConnectionRefusedError,
  DataTypes,
  DatabaseError,
  EmptyResultError,
  Model,
  Op,
  Sequelize,
  Transaction,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from '../../src/index.ts';
import { testDatabaseUrl } from '../support/db-url.ts';
import { withSchema } from '../support/with-schema.ts';

const TABLE = `
  CREATE TABLE items (
    id SERIAL PRIMARY KEY,
    code TEXT,
    qty INTEGER NOT NULL DEFAULT 0,
    attrs JSONB,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  );`;

class Item extends Model<InferAttributes<Item>, InferCreationAttributes<Item>> {
  declare id: CreationOptional<number>;
  declare code: string | null;
  declare qty: CreationOptional<number>;
  declare attrs: Record<string, unknown> | null;
}

const opened: Sequelize[] = [];

afterEach(async () => {
  await Promise.all(opened.splice(0).map((sequelize) => sequelize.close()));
});

const connect = (schema: string, logging: ((sql: string) => void) | false = false): Sequelize => {
  const sequelize = new Sequelize(testDatabaseUrl(), {
    logging,
    define: { underscored: true },
    dialectOptions: { options: `-c search_path=${schema}` },
  });
  opened.push(sequelize);
  Item.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      code: DataTypes.TEXT,
      qty: { type: DataTypes.INTEGER, defaultValue: 0 },
      attrs: DataTypes.JSONB,
    },
    { sequelize, tableName: 'items' },
  );
  return sequelize;
};

const qtyOf = async (where: object): Promise<number[]> =>
  (await Item.findAll({ where: where as never, order: [['id', 'ASC']] })).map((item) => item.qty);

const withItems = <T>(run: (sequelize: Sequelize, schema: string) => Promise<T>): Promise<T> =>
  withSchema(async ({ schema, client }) => {
    await client.query(TABLE);
    const sequelize = connect(schema);
    await Item.bulkCreate([
      { code: 'a', qty: 1, attrs: { color: 'red', size: 1 } },
      { code: null, qty: 2, attrs: { color: 'blue' } },
      { code: 'c', qty: 3, attrs: null },
    ]);
    return run(sequelize, schema);
  });

describe('Sequelize instance', () => {
  it('authenticates, reports version and dialect', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      await expect(sequelize.authenticate()).resolves.toBeUndefined();
      expect(Number.parseInt(await sequelize.databaseVersion(), 10)).toBeGreaterThanOrEqual(16);
      expect(sequelize.getDialect()).toBe('postgres');
      expect(sequelize.isDefined('Item')).toBe(true);
      expect(sequelize.model('Item')).toBe(Item);
      expect(() => sequelize.model('Nope')).toThrow(/has not been defined/);
    }));

  it('uses UTC session time zone by default', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const [rows] = (await sequelize.query('SHOW TimeZone')) as [Array<{ TimeZone: string }>];
      expect(rows[0]?.TimeZone).toMatch(/^(UTC|<\+00>-00|\+00:00)$/);
    }));

  it('maps refused connections', async () => {
    const sequelize = new Sequelize('postgres://u:p@127.0.0.1:1/db', { logging: false });
    opened.push(sequelize);
    await expect(sequelize.authenticate()).rejects.toBeInstanceOf(ConnectionRefusedError);
  });

  it('logs executed SQL with the transaction id', () =>
    withSchema(async ({ schema, client }) => {
      await client.query(TABLE);
      const logged: string[] = [];
      const sequelize = connect(schema, (sql) => logged.push(sql));
      await sequelize.transaction(async (transaction) => {
        await Item.count({ transaction });
        expect(logged.at(-1)).toBe(
          `Executing (${transaction.id}): SELECT count(*) AS "count" FROM "items" AS "Item"`,
        );
      });
    }));

  it('rejects other dialects', () => {
    expect(() => new Sequelize({ dialect: 'mysql' as 'postgres' })).toThrow(
      /only the postgres dialect/,
    );
  });
});

describe('PostgreSQL extensions', () => {
  it('Op.isDistinctFrom / isNotDistinctFrom treat NULL as a value', () =>
    withItems(async () => {
      expect(
        (await Item.findAll({ where: { code: { [Op.isDistinctFrom]: 'a' } } })).map(
          (item) => item.qty,
        ),
      ).toEqual([2, 3]);
      expect(
        (await Item.findAll({ where: { code: { [Op.isNotDistinctFrom]: null } } })).map(
          (item) => item.qty,
        ),
      ).toEqual([2]);
    }));

  it('jsonb key operators', () =>
    withItems(async () => {
      expect(await qtyOf({ attrs: { [Op.hasKey]: 'size' } })).toEqual([1]);
      expect(await qtyOf({ attrs: { [Op.hasAnyKeys]: ['size', 'color'] } })).toEqual([1, 2]);
      expect(await qtyOf({ attrs: { [Op.hasAllKeys]: ['size', 'color'] } })).toEqual([1]);
    }));

  it('long IN lists run as = ANY with one parameter', () =>
    withSchema(async ({ schema, client }) => {
      await client.query(TABLE);
      const logged: string[] = [];
      connect(schema, (sql) => logged.push(sql));
      const ids = Array.from({ length: 500 }, (_, index) => index + 1);
      await Item.bulkCreate([{ code: 'x' }, { code: 'y' }]);
      expect(await Item.count({ where: { id: ids } })).toBe(2);
      expect(logged.at(-1)).toContain('"Item"."id" = ANY($1)');
    }));

  it('destroy with returning returns deleted instances', () =>
    withItems(async () => {
      const deleted = await Item.destroy({ where: { qty: { [Op.gte]: 2 } }, returning: true });
      expect(deleted.map((item) => item.qty).toSorted()).toEqual([2, 3]);
      expect(deleted[0]).toBeInstanceOf(Item);
      expect(await Item.count()).toBe(1);
    }));

  it('destroy with limit deletes at most n rows', () =>
    withItems(async () => {
      expect(await Item.destroy({ where: {}, limit: 2 })).toBe(2);
    }));

  it('lock with NOWAIT fails fast on a locked row', () =>
    withItems(async (sequelize) => {
      const holder = await sequelize.transaction();
      try {
        await Item.findAll({ where: { qty: 1 }, lock: true, transaction: holder });
        const attempt = sequelize.transaction(async (transaction) =>
          Item.findAll({
            where: { qty: 1 },
            lock: Transaction.LOCK.UPDATE,
            noWait: true,
            transaction,
          }),
        );
        await expect(attempt).rejects.toBeInstanceOf(DatabaseError);
        const skipped = await sequelize.transaction(async (transaction) =>
          Item.findAll({ lock: true, skipLocked: true, transaction, order: [['id', 'ASC']] }),
        );
        expect(skipped.map((item) => item.qty)).toEqual([2, 3]);
      } finally {
        await holder.rollback();
      }
    }));
});

describe('transactions', () => {
  it('CLS picks up the managed transaction automatically', () =>
    withItems(async (sequelize) => {
      Sequelize.useCLS();
      await sequelize
        .transaction(async () => {
          await Item.update({ qty: 100 }, { where: {} });
          throw new Error('rollback');
        })
        .catch(() => undefined);
      expect(await Item.sum('qty')).toBe(6);
    }));

  it('nested transactions use savepoints', () =>
    withItems(async (sequelize) => {
      await sequelize.transaction(async (outer) => {
        await Item.create({ code: 'outer' }, { transaction: outer });
        await sequelize
          .transaction({ transaction: outer }, async (inner) => {
            await Item.create({ code: 'inner' }, { transaction: inner });
            throw new Error('inner fails');
          })
          .catch(() => undefined);
      });
      expect(
        (await Item.findAll({ where: { code: ['outer', 'inner'] } })).map((item) => item.code),
      ).toEqual(['outer']);
    }));

  it('runs afterCommit hooks and refuses double commit', () =>
    withItems(async (sequelize) => {
      const transaction = await sequelize.transaction({
        isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE,
      });
      const calls: string[] = [];
      transaction.afterCommit(() => {
        calls.push('after');
      });
      await transaction.commit();
      expect(calls).toEqual(['after']);
      await expect(transaction.commit()).rejects.toThrow(/finished with state: commit/);
    }));
});

describe('model instances', () => {
  it('uses underscored columns and typed attributes', () =>
    withItems(async () => {
      const item = await Item.create({ code: 'typed', attrs: { nested: [1, 2] } });
      expect(item.id).toBeTypeOf('number');
      expect(item.qty).toBe(0);
      expect(item.get('attrs')).toEqual({ nested: [1, 2] });
      expect(Object.keys(item.toJSON())).toEqual(
        expect.arrayContaining(['createdAt', 'updatedAt']),
      );
    }));

  it('tracks changes and previous values', () =>
    withItems(async () => {
      const item = await Item.findOne({ where: { qty: 1 }, rejectOnEmpty: true });
      item.qty = 9;
      expect(item.changed('qty')).toBe(true);
      expect(item.previous('qty')).toBe(1);
      await item.save();
      expect(item.changed()).toBe(false);
      await expect(
        Item.findOne({ where: { qty: 999 }, rejectOnEmpty: true }),
      ).rejects.toBeInstanceOf(EmptyResultError);
    }));

  it('reload throws when the row is gone', () =>
    withItems(async () => {
      const item = await Item.findByPk(1);
      await Item.destroy({ where: { id: 1 } });
      await expect(item?.reload()).rejects.toThrow(/does not exist anymore/);
    }));
});
