import { afterEach, describe, expect, it } from 'vitest';
import { QueryTypes, Sequelize, literal } from '../../src/index.ts';
import { testDatabaseUrl } from '../support/db-url.ts';
import { withSchema } from '../support/with-schema.ts';

const opened: Sequelize[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((sequelize) => sequelize.close()));
});

const inSchema = <T>(run: (sequelize: Sequelize) => Promise<T>): Promise<T> =>
  withSchema(async ({ schema, client }) => {
    await client.query(`
      CREATE TABLE items (id SERIAL PRIMARY KEY, name TEXT, qty INTEGER);
      INSERT INTO items (name, qty) VALUES ('a', 1), ('b', 2), ('c', 3);`);
    const sequelize = new Sequelize(testDatabaseUrl(), {
      logging: false,
      dialectOptions: { options: `-c search_path=${schema}` },
    });
    opened.push(sequelize);
    return run(sequelize);
  });

describe('raw query result shapes (PostgreSQL driver results)', () => {
  it('inlines parameterless expressions given as replacements', () =>
    inSchema(async (sequelize) => {
      const rows = await sequelize.query('SELECT :v AS v', {
        type: QueryTypes.SELECT,
        replacements: { v: literal('42') },
      });
      expect(rows).toEqual([{ v: 42 }]);
    }));

  it('rejects expressions with bound values given as replacements', () =>
    inSchema(async (sequelize) => {
      await expect(
        sequelize.query('SELECT :v AS v', {
          replacements: { v: sequelize.fn('round', 1.5) },
        }),
      ).rejects.toThrow('Expressions with bound values are not supported in replacements');
    }));

  it('writes fn() string arguments of a replacement inline, like v6', () =>
    inSchema(async (sequelize) => {
      const [rows] = await sequelize.query('SELECT :v AS v', {
        replacements: { v: sequelize.fn('lower', 'ABC') },
      });
      expect(rows).toEqual([{ v: 'abc' }]);
    }));
});
