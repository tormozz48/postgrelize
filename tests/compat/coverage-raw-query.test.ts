import { describe, it } from 'vitest';
import { expectSameResult, type Lib } from '../support/compat.ts';
import type { Sequelize } from '../../src/index.ts';

const SCHEMA = `
  CREATE TABLE items (id SERIAL PRIMARY KEY, name TEXT, qty INTEGER);
  INSERT INTO items (name, qty) VALUES ('a', 1), ('b', 2), ('c', 3);`;

const run = (scenario: (lib: Lib, sequelize: Sequelize) => Promise<unknown>) =>
  expectSameResult(SCHEMA, scenario);

describe('compat: raw query result shapes by query type', () => {
  it('returns rows, the first row or null for SELECT', () =>
    run(async ({ QueryTypes }, sequelize) => [
      await sequelize.query('SELECT * FROM items ORDER BY id', { type: QueryTypes.SELECT }),
      await sequelize.query('SELECT * FROM items ORDER BY id', {
        type: QueryTypes.SELECT,
        plain: true,
      }),
      await sequelize.query('SELECT * FROM items WHERE id = 99', {
        type: QueryTypes.SELECT,
        plain: true,
      }),
    ]));

  it('returns the row count for BULKDELETE and BULKUPDATE', () =>
    run(async ({ QueryTypes }, sequelize) => [
      await sequelize.query('UPDATE items SET qty = qty + 1 WHERE id < 3', {
        type: QueryTypes.BULKUPDATE,
      }),
      await sequelize.query('DELETE FROM items WHERE id = 1', { type: QueryTypes.BULKDELETE }),
      await sequelize.query('SELECT id FROM items', { type: QueryTypes.SELECT }),
    ]));

  it('returns rows and the row count for INSERT', () =>
    run(async ({ QueryTypes }, sequelize) =>
      sequelize.query("INSERT INTO items (name, qty) VALUES ('d', 4) RETURNING id", {
        type: QueryTypes.INSERT,
      }),
    ));

  it('returns the first row of an untyped query with plain', () =>
    run(async (_lib, sequelize) => [
      await sequelize.query('SELECT name FROM items ORDER BY id', { plain: true }),
      await sequelize.query('SELECT name FROM items WHERE id = 99', { plain: true }),
    ]));
});
