import { describe, it } from 'vitest';
import { expectSameError, expectSameResult, type Lib } from '../support/compat.ts';
import type { Sequelize } from '../../src/index.ts';

const CHAIN = `
  CREATE TABLE a_tab (id SERIAL PRIMARY KEY, n INTEGER);
  CREATE TABLE b_tab (id SERIAL PRIMARY KEY, n INTEGER, a_id INTEGER REFERENCES a_tab (id));
  CREATE TABLE c_tab (id SERIAL PRIMARY KEY, n INTEGER, b_id INTEGER REFERENCES b_tab (id));
  INSERT INTO a_tab (n) VALUES (1); INSERT INTO b_tab (n, a_id) VALUES (1, 1); INSERT INTO c_tab (n, b_id) VALUES (1, 1);`;

const chain = (lib: Lib, sequelize: Sequelize) => {
  const { DataTypes } = lib;
  const define = (name: string, table: string) =>
    sequelize.define(name, { n: DataTypes.INTEGER }, { tableName: table, timestamps: false });
  const A = define('A', 'a_tab');
  const B = define('B', 'b_tab');
  const C = define('C', 'c_tab');
  B.belongsTo(A, { foreignKey: 'a_id' });
  C.belongsTo(B, { foreignKey: 'b_id' });
};

const tables = (log: string[]): string[] =>
  log.flatMap((sql) => /TRUNCATE\s+(?:ONLY\s+)?"?(\w+)"?/i.exec(sql)?.[1] ?? []);

describe('Sequelize#truncate matches sequelize v6', () => {
  it('truncates referencing tables first with cascade', () =>
    expectSameResult(CHAIN, async (lib, sequelize) => {
      chain(lib, sequelize);
      const log: string[] = [];
      await sequelize.truncate({ cascade: true, logging: (sql: string) => log.push(sql) });
      const rows = (await sequelize.query(
        'SELECT (SELECT count(*) FROM a_tab) AS a, (SELECT count(*) FROM c_tab) AS c',
        {
          type: 'SELECT',
        },
      )) as unknown[];
      return { order: tables(log), rows };
    }));

  it('rejects a reference cycle without cascade', () =>
    expectSameError(
      `CREATE TABLE p_tab (id SERIAL PRIMARY KEY, q_id INTEGER); CREATE TABLE q_tab (id SERIAL PRIMARY KEY, p_id INTEGER REFERENCES p_tab (id));
       ALTER TABLE p_tab ADD FOREIGN KEY (q_id) REFERENCES q_tab (id);`,
      async (lib, sequelize) => {
        const P = sequelize.define('P', {}, { tableName: 'p_tab', timestamps: false });
        const Q = sequelize.define('Q', {}, { tableName: 'q_tab', timestamps: false });
        P.belongsTo(Q, { foreignKey: 'q_id' });
        Q.belongsTo(P, { foreignKey: 'p_id' });
        void lib;
        await sequelize.truncate();
      },
    ));
});

const insertChildFirst = async (sequelize: Sequelize, deferrable: unknown): Promise<unknown> => {
  await sequelize.transaction({ deferrable } as never, async (transaction) => {
    await sequelize.query('INSERT INTO child (parent_id) VALUES (7)', { transaction });
    await sequelize.query('INSERT INTO parent (id) VALUES (7)', { transaction });
  });
  return sequelize.query('SELECT parent_id FROM child', { type: 'SELECT' });
};

describe('Deferrable.SET_DEFERRED matches sequelize v6', () => {
  const SETUP = `CREATE TABLE parent (id INTEGER PRIMARY KEY);
    CREATE TABLE child (id SERIAL PRIMARY KEY, parent_id INTEGER, CONSTRAINT child_parent_fk FOREIGN KEY (parent_id) REFERENCES parent (id) DEFERRABLE INITIALLY IMMEDIATE);`;

  it('defers all constraints when called without names', () =>
    expectSameResult(SETUP, (lib, sequelize) =>
      insertChildFirst(
        sequelize,
        (lib.Deferrable as unknown as { SET_DEFERRED: () => unknown }).SET_DEFERRED(),
      ),
    ));

  it('defers the named constraints', () =>
    expectSameResult(SETUP, (lib, sequelize) =>
      insertChildFirst(
        sequelize,
        (lib.Deferrable as unknown as { SET_DEFERRED: (c: string[]) => unknown }).SET_DEFERRED([
          'child_parent_fk',
        ]),
      ),
    ));

  it('still fails when nothing is deferred', () =>
    // The error `fields` differ between the libraries (a known difference), so only the class is compared.
    expectSameResult(SETUP, async (_lib, sequelize) => {
      const error = await insertChildFirst(sequelize, undefined).catch((e: Error) => e);
      return (error as Error).name;
    }));
});
