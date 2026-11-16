import { afterEach, describe, expect, it } from 'vitest';
import { DataTypes, QueryTypes, Sequelize } from '../../src/index.ts';
import { testDatabaseUrl } from '../support/db-url.ts';
import { withSchema } from '../support/with-schema.ts';

const opened: Sequelize[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((sequelize) => sequelize.close()));
});

const connect = (schema: string): Sequelize => {
  const sequelize = new Sequelize(testDatabaseUrl(), {
    logging: false,
    dialectOptions: { options: `-c search_path=${schema}` },
  });
  opened.push(sequelize);
  return sequelize;
};

const select = async <T>(sequelize: Sequelize, sql: string): Promise<T[]> =>
  (await sequelize.query(sql, { type: QueryTypes.SELECT })) as T[];

describe('extensions', () => {
  it('creates and drops an extension', () =>
    withSchema(async ({ schema }) => {
      const queryInterface = connect(schema).getQueryInterface();
      await queryInterface.createExtension('pg_trgm', { schema });
      await queryInterface.createExtension('pg_trgm', { ifNotExists: true, schema });
      const sequelize = queryInterface.sequelize as Sequelize;
      const names = async () =>
        (
          await select<{ extname: string }>(
            sequelize,
            "SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'",
          )
        ).length;
      expect(await names()).toBe(1);
      await queryInterface.dropExtension('pg_trgm');
      expect(await names()).toBe(0);
      await queryInterface.dropExtension('pg_trgm', { ifExists: true });
    }));
});

describe('sequences', () => {
  it('creates, advances, alters and drops a sequence', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const queryInterface = sequelize.getQueryInterface();
      await queryInterface.createSequence('invoice_no', { start: 100, increment: 5, cache: 1 });
      expect(await queryInterface.nextval('invoice_no')).toBe('100');
      expect(await queryInterface.nextval({ tableName: 'invoice_no', schema })).toBe('105');
      expect(await queryInterface.setval('invoice_no', 500)).toBe('500');
      expect(await queryInterface.nextval('invoice_no')).toBe('505');
      await queryInterface.setval('invoice_no', 900, false);
      expect(await queryInterface.nextval('invoice_no')).toBe('900');
      await queryInterface.alterSequence('invoice_no', { restartWith: 7, increment: 1 });
      expect(await queryInterface.nextval('invoice_no')).toBe('7');
      await queryInterface.dropSequence('invoice_no');
      await queryInterface.dropSequence('invoice_no', { ifExists: true });
      await expect(queryInterface.nextval('invoice_no')).rejects.toThrow(/does not exist/);
    }));

  it('supports bigint bounds, cycling and column ownership', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      const queryInterface = sequelize.getQueryInterface();
      sequelize.define('Seq', { name: DataTypes.TEXT }, { timestamps: false });
      await sequelize.sync();
      await queryInterface.createSequence('cyc', {
        dataType: 'smallint',
        minValue: 1,
        maxValue: 2,
        cycle: true,
      });
      expect(await queryInterface.nextval('cyc')).toBe('1');
      expect(await queryInterface.nextval('cyc')).toBe('2');
      expect(await queryInterface.nextval('cyc')).toBe('1');
      await queryInterface.createSequence('big', {
        dataType: 'bigint',
        start: 9_007_199_254_740_993n,
        ifNotExists: true,
      });
      await queryInterface.createSequence('big', { ifNotExists: true });
      expect(await queryInterface.nextval('big')).toBe('9007199254740993');
      await queryInterface.createSequence('owned', { ownedBy: { table: 'Seqs', column: 'name' } });
      await queryInterface.alterSequence('owned', { ownedBy: null, ifExists: true });
      await queryInterface.dropSequence('owned', { cascade: true });
    }));
});
