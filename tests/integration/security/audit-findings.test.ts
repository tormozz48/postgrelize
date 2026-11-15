import { describe, expect, it } from 'vitest';
import {
  DataTypes,
  Sequelize,
  col,
  fn,
  literal,
  where,
  type DeferrableValue,
} from '../../../src/index.ts';
import { testDatabaseUrl } from '../../support/db-url.ts';
import { settle, withCanary } from '../../support/injection.ts';

// Regression tests for the S5 injection audit (.10x/reviews/2026-11-15-injection-review.md).
const STACKED = 'UPDATE; CREATE TABLE pwned (); --' as 'UPDATE';

describe('S5 injection audit findings', () => {
  it('F1: lock strengths outside LOCK fall back to FOR UPDATE, as in v6', () =>
    withCanary(async ({ sequelize }) => {
      const Doc = sequelize.define('Doc', { title: DataTypes.TEXT });
      await Doc.sync();
      const sql: string[] = [];
      await sequelize.transaction(async (transaction) => {
        await Doc.findAll({ transaction, lock: STACKED, logging: (text) => sql.push(text) });
        await Doc.findAll({
          transaction,
          lock: { level: STACKED, of: Doc },
          logging: (text) => sql.push(text),
        });
        await Doc.findAll({ transaction, lock: 'KEY SHARE', logging: (text) => sql.push(text) });
      });
      expect(sql.map((text) => / FOR [A-Z ]+?(?: OF "Doc")?;?$/.exec(text)?.[0])).toEqual([
        ' FOR UPDATE',
        ' FOR UPDATE OF "Doc"',
        ' FOR KEY SHARE',
      ]);
    }));

  it('F2: Model.aggregate validates the function name', () =>
    withCanary(async ({ sequelize }) => {
      const Doc = sequelize.define('Doc', { title: DataTypes.TEXT });
      await Doc.sync();
      await expect(
        Doc.aggregate('id', 'count(*) FROM "Docs"; CREATE TABLE pwned (); SELECT max'),
      ).rejects.toThrow(/Invalid function name/);
      expect(await Doc.aggregate('id', 'count')).toBe(0);
    }));

  it('F3: comparators cannot contain comment tokens', () =>
    withCanary(async ({ sequelize }) => {
      const Doc = sequelize.define('Doc', { title: DataTypes.TEXT });
      await Doc.sync();
      for (const comparator of ['--', '/*', '*/', '=--']) {
        await expect(
          Doc.findAll({ where: where(col('title'), comparator, literal('x')) }),
        ).rejects.toThrow(/Invalid comparator/);
      }
      expect(await Doc.findAll({ where: where(col('title'), '<>', 'x') })).toEqual([]);
    }));

  it('F4: isolation levels outside ISOLATION_LEVELS are rejected', () =>
    withCanary(async ({ sequelize }) => {
      const result = await settle(
        sequelize.transaction(
          { isolationLevel: 'SERIALIZABLE; CREATE TABLE pwned (); --' as 'SERIALIZABLE' },
          async () => 1,
        ),
      );
      expect(String(result)).toMatch(/Invalid isolation level/);
      expect(
        await sequelize.transaction({ isolationLevel: 'REPEATABLE READ' }, async () => 1),
      ).toBe(1);
    }));

  it('F5: deferrable accepts only Deferrable values and DataTypes parameters must be integers', () =>
    withCanary(async ({ sequelize }) => {
      const queryInterface = sequelize.getQueryInterface();
      await queryInterface.createTable('parents', {
        id: { type: DataTypes.INTEGER, primaryKey: true },
      });
      await queryInterface.createTable('children', { parentId: DataTypes.INTEGER });
      const forged = { sql: 'NOT DEFERRABLE; CREATE TABLE pwned (); --' } as DeferrableValue;
      await expect(
        queryInterface.addConstraint('children', {
          type: 'foreign key',
          fields: ['parentId'],
          references: { table: 'parents', field: 'id' },
          deferrable: forged,
        }),
      ).rejects.toThrow(/Invalid deferrable/);
      const payload = '1); CREATE TABLE pwned (); --' as unknown as number;
      expect(() => DataTypes.STRING(payload)).toThrow(/must be a non-negative integer/);
      expect(() => DataTypes.CHAR(payload)).toThrow(/must be a non-negative integer/);
      expect(() => DataTypes.DECIMAL(10, payload)).toThrow(/must be a non-negative integer/);
      expect(() => DataTypes.FLOAT(payload)).toThrow(/must be a non-negative integer/);
      expect(() => DataTypes.DATE(payload)).toThrow(/must be a non-negative integer/);
      expect(() => DataTypes.GEOMETRY('POINT); CREATE TABLE pwned (); --')).toThrow(
        /Invalid spatial type/,
      );
      expect(() => DataTypes.GEOMETRY('POINT', payload)).toThrow(/must be a non-negative integer/);
      expect(DataTypes.GEOMETRY('POINT', 4326).sqlType).toBe('GEOMETRY(POINT,4326)');
    }));

  it('F6: function names with $n are not mistaken for inlined placeholders', () =>
    withCanary(async ({ sequelize }) => {
      const Doc = sequelize.define('Doc', { title: DataTypes.TEXT });
      await Doc.sync();
      const copy = async () => {
        const chunks: Buffer[] = [];
        for await (const chunk of Doc.copyTo({
          attributes: [[fn('lower$1', col('title')), 'x']],
          where: { title: "it's" },
        })) {
          chunks.push(chunk);
        }
        return chunks;
      };
      await expect(copy()).rejects.toThrow(/function lower\$1\(text\) does not exist/);
    }));

  it('F7: the timezone option is validated', async () => {
    expect(
      () => new Sequelize(testDatabaseUrl(), { timezone: '+00:00 -c search_path=evil,public' }),
    ).toThrow(/Invalid timezone/);
    const sequelize = new Sequelize(testDatabaseUrl(), { logging: false, timezone: 'Europe/Kyiv' });
    try {
      expect(await sequelize.query('SHOW TimeZone', { plain: true, type: 'SELECT' })).toEqual({
        TimeZone: 'Europe/Kyiv',
      });
    } finally {
      await sequelize.close();
    }
  });
});
