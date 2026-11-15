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
  it('returns the affected row count for a DELETE query', () =>
    inSchema(async (sequelize) => {
      const count = await sequelize.query('DELETE FROM items WHERE id <= 2', {
        type: QueryTypes.DELETE,
      });
      expect(count).toBe(2);
      expect(await sequelize.query('SELECT id FROM items', { type: QueryTypes.SELECT })).toEqual([
        { id: 3 },
      ]);
    }));

  it('returns returned rows and the row count for UPDATE and UPSERT queries', () =>
    inSchema(async (sequelize) => {
      const updated = await sequelize.query('UPDATE items SET qty = 0 WHERE id = 1 RETURNING id', {
        type: QueryTypes.UPDATE,
      });
      expect(updated).toEqual([[{ id: 1 }], 1]);
      const upserted = await sequelize.query(
        "INSERT INTO items (id, name, qty) VALUES (1, 'z', 9) ON CONFLICT (id) DO UPDATE SET qty = 9 RETURNING id",
        { type: QueryTypes.UPSERT },
      );
      expect(upserted).toEqual([[{ id: 1 }], 1]);
    }));

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
          replacements: { v: sequelize.fn('lower', 'ABC') },
        }),
      ).rejects.toThrow('Expressions with bound values are not supported in replacements');
    }));
});
