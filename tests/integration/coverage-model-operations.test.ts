import { afterEach, describe, expect, it } from 'vitest';
import { DataTypes, Op, Sequelize, col, literal } from '../../src/index.ts';
import { testDatabaseUrl } from '../support/db-url.ts';
import { withSchema } from '../support/with-schema.ts';

const opened: Sequelize[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((sequelize) => sequelize.close()));
});

const setup = async (schema: string, logging: (sql: string) => void = () => undefined) => {
  const sequelize = new Sequelize(testDatabaseUrl(), {
    logging,
    dialectOptions: { options: `-c search_path=${schema}` },
  });
  opened.push(sequelize);
  const Stock = sequelize.define('Stock', {
    sku: { type: DataTypes.TEXT, allowNull: false, unique: true },
    qty: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    kind: { type: DataTypes.TEXT, defaultValue: 'a' },
  });
  const Delivery = sequelize.define(
    'Delivery',
    { sku: DataTypes.TEXT, amount: DataTypes.INTEGER },
    { timestamps: false },
  );
  await sequelize.sync();
  await Stock.bulkCreate([
    { sku: 'a', qty: 1, kind: 'a' },
    { sku: 'b', qty: 2, kind: 'b' },
  ]);
  await Delivery.bulkCreate([
    { sku: 'b', amount: 20 },
    { sku: 'z', amount: 30 },
  ]);
  return { sequelize, Stock, Delivery };
};

const quantities = async (Stock: Awaited<ReturnType<typeof setup>>['Stock']) =>
  (await Stock.findAll({ order: [['sku', 'ASC']] })).map((row) => [row.get('sku'), row.get('qty')]);

describe('MERGE option validation and sources', () => {
  it('requires a join condition', () =>
    withSchema(async ({ schema }) => {
      const { Stock } = await setup(schema);
      await expect(
        Stock.merge({ source: [{ sku: 'a' }], on: {}, whenMatched: { delete: true } }),
      ).rejects.toThrow('merge: on condition is required');
    }));

  it('requires returning with returningOld before touching the database', () =>
    withSchema(async ({ schema }) => {
      const { Stock } = await setup(schema);
      await expect(
        Stock.merge({
          source: [{ sku: 'a' }],
          on: { sku: col('source.sku') },
          whenMatched: { delete: true },
          returningOld: true,
        }),
      ).rejects.toThrow('merge: returningOld requires returning: true');
      expect(await quantities(Stock)).toEqual([
        ['a', 1],
        ['b', 2],
      ]);
    }));

  it('inserts source columns of a subquery that are not matched and keeps matched rows', () =>
    withSchema(async ({ schema }) => {
      const { Stock, Delivery } = await setup(schema);
      await Stock.merge({
        source: Delivery.subquery({ attributes: ['sku', ['amount', 'qty']] }),
        as: 'd',
        on: { sku: col('d.sku') },
        whenMatched: {},
        whenNotMatched: { insert: true },
      });
      expect(await quantities(Stock)).toEqual([
        ['a', 1],
        ['b', 2],
        ['z', 30],
      ]);
    }));
});

describe('findEach edge cases', () => {
  it('rejects joined includes and invalid batch sizes before opening a cursor', () =>
    withSchema(async ({ schema }) => {
      const { Stock, Delivery } = await setup(schema);
      Stock.hasMany(Delivery, { foreignKey: 'sku', sourceKey: 'sku', as: 'deliveries' });
      await expect(
        Stock.findEach({ include: [{ association: 'deliveries' }] }, {}).next(),
      ).rejects.toThrow('findEach does not support joined includes');
      await expect(Stock.findEach({}, { batchSize: 1.5 }).next()).rejects.toThrow(
        'findEach: batchSize must be a positive integer',
      );
    }));

  it('streams inside a caller transaction and leaves it usable', () =>
    withSchema(async ({ schema }) => {
      const logged: string[] = [];
      const { sequelize, Stock } = await setup(schema, (sql) => logged.push(sql));
      const skus = await sequelize.transaction(async (transaction) => {
        const seen: string[] = [];
        for await (const row of Stock.findEach(
          { order: [['sku', 'ASC']], transaction },
          { batchSize: 1 },
        )) {
          seen.push(String(row.get('sku')));
          break;
        }
        await Stock.update({ qty: 9 }, { where: { sku: 'a' }, transaction });
        return seen;
      });
      expect(skus).toEqual(['a']);
      expect(logged.some((sql) => /CLOSE "?pgz_cursor_/.test(sql))).toBe(true);
      expect(await quantities(Stock)).toEqual([
        ['a', 9],
        ['b', 2],
      ]);
    }));

  it('rolls its own transaction back when the query fails', () =>
    withSchema(async ({ schema }) => {
      const logged: string[] = [];
      const { Stock } = await setup(schema, (sql) => logged.push(sql));
      await expect(
        Stock.findEach({ where: literal('no_such_column = 1') }, {}).next(),
      ).rejects.toThrow(/no_such_column/);
      expect(logged.some((sql) => sql.includes('ROLLBACK'))).toBe(true);
      expect(await Stock.count()).toBe(2);
    }));

  it('surfaces the query error and ignores the failing CLOSE inside a caller transaction', () =>
    withSchema(async ({ schema }) => {
      const { sequelize, Stock } = await setup(schema);
      const outcome = await sequelize
        .transaction(async (transaction) => {
          await Stock.findEach({ where: literal('no_such_column = 1'), transaction }, {}).next();
        })
        .then(
          () => 'resolved',
          (error: Error) => error.message,
        );
      expect(outcome).toMatch(/no_such_column/);
    }));
});

describe('write option validation', () => {
  it('rejects individualHooks together with from', () =>
    withSchema(async ({ schema }) => {
      const { Stock, Delivery } = await setup(schema);
      await expect(
        Stock.update({ qty: 0 }, { where: {}, individualHooks: true, from: Delivery } as never),
      ).rejects.toThrow('update: individualHooks cannot be combined with from');
    }));

  it('rejects returningOld on update without returning', () =>
    withSchema(async ({ schema }) => {
      const { Stock } = await setup(schema);
      await expect(
        Stock.update({ qty: 0 }, { where: {}, returningOld: true } as never),
      ).rejects.toThrow('update: returningOld requires returning: true');
    }));

  it('rejects an onConflict target without columns', () =>
    withSchema(async ({ schema }) => {
      const { Stock } = await setup(schema);
      await expect(
        Stock.insert({ sku: 'q' }, { onConflict: { target: [], action: 'nothing' } } as never),
      ).rejects.toThrow('onConflict: target columns must not be empty');
    }));

  it('rejects skipLocked together with noWait', () =>
    withSchema(async ({ schema }) => {
      const { sequelize, Stock } = await setup(schema);
      await expect(
        sequelize.transaction((transaction) =>
          Stock.findAll({ lock: true, skipLocked: true, noWait: true, transaction }),
        ),
      ).rejects.toThrow('skipLocked and noWait cannot be used together');
    }));

  it('rejects an unknown copyFrom attribute', () =>
    withSchema(async ({ schema }) => {
      const { Stock } = await setup(schema);
      await expect(
        Stock.copyFrom([{ sku: 'c', qty: 1 }], { columns: ['sku', 'nope'] as never }),
      ).rejects.toThrow('copyFrom: unknown attribute "nope" of model Stock');
    }));

  it('rejects a copyTo quote of several characters', () =>
    withSchema(async ({ schema }) => {
      const { Stock } = await setup(schema);
      expect(() => Stock.copyTo({ format: 'csv', quote: '""' })).toThrow(
        'copyTo: quote must be a single character',
      );
    }));
});

describe('insert, upsert and bulk write corner cases', () => {
  it('insert of no rows writes nothing', () =>
    withSchema(async ({ schema }) => {
      const { Stock } = await setup(schema);
      expect(
        await Stock.insert([], { onConflict: { target: ['sku'], action: 'nothing' } }),
      ).toEqual([]);
      expect(await Stock.count()).toBe(2);
    }));

  it('insert validates the rows when asked to', () =>
    withSchema(async ({ schema }) => {
      const { Stock } = await setup(schema);
      await expect(Stock.insert({ qty: 1 }, { validate: true })).rejects.toThrow(
        /Stock.sku cannot be null/,
      );
      expect(await Stock.count()).toBe(2);
    }));

  it('upsert with fields updates only the listed columns on conflict', () =>
    withSchema(async ({ schema }) => {
      const { Stock } = await setup(schema);
      await Stock.upsert({ sku: 'a', qty: 50, kind: 'zz' }, { fields: ['sku', 'qty'] });
      const row = await Stock.findOne({ where: { sku: 'a' } });
      expect([row?.get('qty'), row?.get('kind')]).toEqual([50, 'a']);
    }));
});

describe('attributes with include and exclude', () => {
  it('selects all but the excluded attributes plus computed ones', () =>
    withSchema(async ({ schema }) => {
      const { Stock } = await setup(schema);
      const row = await Stock.findOne({
        where: { sku: 'a' },
        attributes: {
          exclude: ['kind', 'createdAt', 'updatedAt'],
          include: [[literal('7'), 'seven']],
        },
        raw: true,
      });
      expect(row).toEqual({ id: expect.any(Number), sku: 'a', qty: 1, seven: 7 });
    }));
});

describe('copyTo single-character options', () => {
  it('emits a custom delimiter and quote', () =>
    withSchema(async ({ schema }) => {
      const { Stock } = await setup(schema);
      const chunks: string[] = [];
      for await (const chunk of Stock.copyTo({
        format: 'csv',
        attributes: ['sku', 'qty'],
        order: [['sku', 'ASC']],
        delimiter: ';',
        quote: "'",
      })) {
        chunks.push(String(chunk));
      }
      expect(chunks.join('')).toBe('a;1\nb;2\n');
    }));
});

describe('association properties of instances', () => {
  it('keeps an assigned association value as a plain property outside the instance data (v6)', () =>
    withSchema(async ({ schema }) => {
      const { Stock, Delivery } = await setup(schema);
      Stock.hasMany(Delivery, { foreignKey: 'sku', sourceKey: 'sku', as: 'deliveries' });
      const stock = Stock.build({ sku: 'a' }) as unknown as Record<string, unknown> & {
        dataValues: Record<string, unknown>;
      };
      expect(stock['deliveries']).toBeUndefined();
      const assigned = [Delivery.build({ sku: 'a', amount: 1 })];
      stock['deliveries'] = assigned;
      expect(stock['deliveries']).toBe(assigned);
      expect(stock.dataValues['deliveries']).toBeUndefined();
    }));
});

describe('create with an explicit fields list', () => {
  it('still writes the timestamps (v6)', () =>
    withSchema(async ({ schema }) => {
      const { Stock } = await setup(schema);
      const created = await Stock.create({ sku: 'f', qty: 3 }, { fields: ['sku', 'qty'] });
      expect(created.get('createdAt')).toBeInstanceOf(Date);
    }));
});

describe('aggregates', () => {
  it('count with group returns grouped rows with numeric counts', () =>
    withSchema(async ({ schema }) => {
      const { Stock } = await setup(schema);
      const rows = (await Stock.count({
        where: { qty: { [Op.gte]: 1 } },
        group: ['kind'],
      })) as unknown as { kind: string; count: number }[];
      expect(rows.toSorted((a, b) => a.kind.localeCompare(b.kind))).toEqual([
        { kind: 'a', count: 1 },
        { kind: 'b', count: 1 },
      ]);
    }));
});
