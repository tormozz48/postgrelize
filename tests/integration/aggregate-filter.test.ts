import { afterEach, describe, expect, it } from 'vitest';
import {
  DataTypes,
  Op,
  Sequelize,
  col,
  exists,
  filter,
  fn,
  literal,
  over,
  where,
} from '../../src/index.ts';
import { testDatabaseUrl } from '../support/db-url.ts';
import { parameterizedSql } from '../support/parameterized-log.ts';
import { withSchema } from '../support/with-schema.ts';

const opened: Sequelize[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((sequelize) => sequelize.close()));
});

const setup = (schema: string, minifyAliases: boolean) => {
  const logged: string[] = [];
  const sequelize = new Sequelize(testDatabaseUrl(), {
    minifyAliases,
    define: { timestamps: false },
    logging: (_sql, options) => logged.push(parameterizedSql(options)),
    dialectOptions: { options: `-c search_path=${schema}` },
  });
  opened.push(sequelize);
  const Account = sequelize.define('BkAccount', { name: DataTypes.TEXT });
  const Entry = sequelize.define(
    'BkJournalEntry',
    { debitAccountId: DataTypes.INTEGER, amount: DataTypes.INTEGER },
    { freezeTableName: true },
  );
  Account.hasMany(Entry, { as: 'entries', foreignKey: 'debitAccountId' });
  return { sequelize, Account, Entry, logged };
};

const withData = <T>(
  run: (models: ReturnType<typeof setup>) => Promise<T>,
  minifyAliases = false,
): Promise<T> =>
  withSchema(async ({ schema }) => {
    const models = setup(schema, minifyAliases);
    await models.sequelize.sync();
    await models.Account.bulkCreate([{ name: 'cash' }, { name: 'bank' }, { name: 'idle' }]);
    await models.Entry.bulkCreate([
      { debitAccountId: 1, amount: 10 },
      { debitAccountId: 1, amount: 30 },
      { debitAccountId: 2, amount: 5 },
    ]);
    models.logged.length = 0;
    return run(models);
  });

const count = () => fn('COUNT', col('*'));
const amount = () => col('BkJournalEntry.amount');

describe('aggregate FILTER', () => {
  it('selects COUNT, SUM, MIN, MAX and COUNT(DISTINCT) with a filter', () =>
    withData(async ({ Entry, logged }) => {
      const cash = { debitAccountId: 1 };
      const rows = await Entry.findAll({
        attributes: [
          [filter(count(), cash), 'n'],
          [filter(fn('SUM', amount()), cash), 'total'],
          [filter(fn('MIN', amount()), cash), 'low'],
          [filter(fn('MAX', amount()), cash), 'high'],
          [
            filter(fn('COUNT', fn('DISTINCT', col('BkJournalEntry.debitAccountId'))), {
              amount: { [Op.gt]: 1 },
            }),
            'accounts',
          ],
        ],
        raw: true,
      });
      expect(rows).toEqual([{ n: '2', total: '40', low: 10, high: 30, accounts: '2' }]);
      expect(logged[0]).toBe(
        'SELECT COUNT(*) FILTER (WHERE "BkJournalEntry"."debitAccountId" = $1) AS "n", ' +
          'SUM("BkJournalEntry"."amount") FILTER (WHERE "BkJournalEntry"."debitAccountId" = $2) AS "total", ' +
          'MIN("BkJournalEntry"."amount") FILTER (WHERE "BkJournalEntry"."debitAccountId" = $3) AS "low", ' +
          'MAX("BkJournalEntry"."amount") FILTER (WHERE "BkJournalEntry"."debitAccountId" = $4) AS "high", ' +
          'COUNT(DISTINCT("BkJournalEntry"."debitAccountId")) FILTER (WHERE "BkJournalEntry"."amount" > $5) AS "accounts" ' +
          'FROM "BkJournalEntry"',
      );
    }));

  it('works with group and having', () =>
    withData(async ({ Entry, logged }) => {
      const large = filter(count(), { amount: { [Op.gte]: 10 } });
      const rows = await Entry.findAll({
        attributes: ['debitAccountId', [large, 'large']],
        group: ['debitAccountId'],
        having: where(large, Op.gt, 0),
        raw: true,
      });
      expect(rows).toEqual([{ debitAccountId: 1, large: '2' }]);
      expect(logged[0]).toContain(
        'GROUP BY "BkJournalEntry"."debitAccountId" HAVING COUNT(*) FILTER (WHERE "BkJournalEntry"."amount" >= $2) > $3',
      );
    }));

  it('inlines finder replacements like the hand-written form', () =>
    withData(async ({ Entry }) => {
      const rows = await Entry.findAll({
        attributes: [[filter(count(), { debitAccountId: literal(':account') }), 'n']],
        replacements: { account: 2 },
        raw: true,
      });
      expect(rows).toEqual([{ n: '1' }]);
    }));

  it('correlates exists() and col() with the outer query', () =>
    withData(async ({ Account, Entry }) => {
      const used = exists(Entry.subquery({ where: { debitAccountId: col('BkAccount.id') } }));
      const rows = await Account.findAll({
        attributes: [
          [filter(count(), used), 'used'],
          [
            filter(count(), { [Op.and]: [used, { name: { [Op.ne]: col('BkAccount.name') } }] }),
            'none',
          ],
        ],
        raw: true,
      });
      expect(rows).toEqual([{ used: '2', none: '0' }]);
    }));

  it('combines with OVER', () =>
    withData(async ({ Entry }) => {
      const rows = await Entry.findAll({
        attributes: [
          'id',
          [
            over(filter(fn('SUM', amount()), { amount: { [Op.gt]: 5 } }), {
              partitionBy: ['debitAccountId'],
            }),
            'total',
          ],
        ],
        order: [['id', 'ASC']],
        raw: true,
      });
      expect(rows.map((row) => (row as unknown as { total: string | null }).total)).toEqual([
        '40',
        '40',
        null,
      ]);
    }));

  it('keeps include aliases with minifyAliases', () =>
    withData(async ({ Account, logged }) => {
      const rows = await Account.findAll({
        attributes: [
          'id',
          [
            filter(fn('SUM', col('entries.amount')), { '$entries.amount$': { [Op.gt]: 5 } }),
            'total',
          ],
        ],
        include: [{ association: 'entries', attributes: [] }],
        group: ['BkAccount.id'],
        order: [['id', 'ASC']],
        raw: true,
      });
      expect(rows).toEqual([
        { id: 1, total: '40' },
        { id: 2, total: null },
        { id: 3, total: null },
      ]);
      expect(logged[0]).toContain(
        'SUM("entries"."amount") FILTER (WHERE "entries"."amount" > $1) AS "total"',
      );
    }, true));
});
