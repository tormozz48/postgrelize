import { describe, expect, it } from 'vitest';
import { DataTypes, Sequelize } from '../../../src/index.ts';
import { testDatabaseUrl } from '../../support/db-url.ts';
import { PAYLOADS } from '../../support/injection.ts';
import { withSchema } from '../../support/with-schema.ts';

const connect = (schema: string, statementCache = false): Sequelize =>
  new Sequelize(testDatabaseUrl(), {
    logging: false,
    statementCache,
    pool: { max: 1 },
    dialectOptions: { prependSearchPath: true, options: `-c search_path=${schema}` },
  });

const currentPath = async (sequelize: Sequelize, options: object = {}): Promise<string> => {
  const [rows] = await sequelize.query("SELECT current_setting('search_path') AS path", options);
  return (rows[0] as { path: string }).path;
};

describe('searchPath', () => {
  it('binds the value: payloads never run as SQL', () =>
    withSchema(async ({ schema, client }) => {
      await client.query('CREATE TABLE canary (id int)');
      const sequelize = connect(schema);
      try {
        for (const payload of PAYLOADS) {
          await currentPath(sequelize, { searchPath: payload }).catch(() => undefined);
        }
        expect(await currentPath(sequelize)).toBe(schema);
        await expect(client.query('SELECT * FROM canary')).resolves.toBeDefined();
      } finally {
        await sequelize.close();
      }
    }));

  it('restores the path of the pooled connection, also after a failed statement', () =>
    withSchema(async ({ schema }) => {
      const sequelize = connect(schema);
      try {
        expect(await currentPath(sequelize, { searchPath: 'public' })).toBe('public');
        await expect(sequelize.query('SELECT nope', { searchPath: 'public' })).rejects.toThrow(
          'nope',
        );
        await expect(
          sequelize.transaction((transaction) =>
            sequelize.query('SELECT nope', { searchPath: 'public', transaction }),
          ),
        ).rejects.toThrow('nope');
        expect(await currentPath(sequelize)).toBe(schema);
      } finally {
        await sequelize.close();
      }
    }));

  it('does not reuse a prepared statement across paths', () =>
    withSchema(async ({ schema, client }) => {
      const [one, two] = [`${schema}_one`, `${schema}_two`];
      await client.query(`CREATE SCHEMA ${one}; CREATE SCHEMA ${two}`);
      const sequelize = connect(schema, true);
      try {
        const Item = sequelize.define('Item', { name: DataTypes.STRING }, { tableName: 'items' });
        for (const path of [one, two]) {
          await Item.sync({ searchPath: path });
          await Item.create({ name: path }, { searchPath: path });
        }
        const names = async (path: string): Promise<unknown[]> =>
          (await Item.findAll({ searchPath: path })).map((row) => row.get('name'));
        expect([await names(one), await names(two)]).toEqual([[one], [two]]);
      } finally {
        await sequelize.close();
        await client.query(`DROP SCHEMA ${one} CASCADE; DROP SCHEMA ${two} CASCADE`);
      }
    }));
});
