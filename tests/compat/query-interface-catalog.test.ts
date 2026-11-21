import { describe, it } from 'vitest';
import { expectSameError, expectSameResult } from '../support/compat.ts';
import type { Sequelize } from '../../src/index.ts';

const SETUP = `
  CREATE TABLE authors (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE);
  CREATE TABLE books (
    id SERIAL PRIMARY KEY, title TEXT NOT NULL, author_id INTEGER REFERENCES authors (id),
    isbn TEXT, CONSTRAINT books_isbn_key UNIQUE (isbn), CONSTRAINT books_title_check CHECK (title <> '')
  );
  CREATE INDEX books_title_idx ON books (title DESC, author_id);
  CREATE INDEX books_lower_idx ON books (lower(title));
  CREATE INDEX books_collate_idx ON books (isbn COLLATE "C" ASC);`;

const schemaOf = async (sequelize: Sequelize): Promise<string> => {
  const [rows] = (await sequelize.query('SELECT current_schema() AS schema')) as unknown as [
    { schema: string }[],
  ];
  return rows[0]?.schema ?? '';
};

const scrub = (value: unknown, schema: string): unknown =>
  JSON.parse(JSON.stringify(value).replaceAll(schema, '<schema>'));

describe('QueryInterface catalog methods match sequelize v6', () => {
  it('showIndex lists indexes with ordered fields', () =>
    expectSameResult(SETUP, async (_lib, sequelize) => {
      const schema = await schemaOf(sequelize);
      const rows = await sequelize.getQueryInterface().showIndex({ tableName: 'books', schema });
      return scrub(rows, schema);
    }));

  it('showConstraint lists the constraints of a table', () =>
    expectSameResult(SETUP, async (_lib, sequelize) => {
      const schema = await schemaOf(sequelize);
      const rows = (await sequelize.getQueryInterface().showConstraint('books')) as unknown as {
        constraintName: string;
      }[];
      const sorted = rows
        .filter((row) => !row.constraintName.endsWith('_not_null'))
        .toSorted((a, b) => a.constraintName.localeCompare(b.constraintName));
      return scrub(sorted, schema);
    }));

  it('quoteIdentifier(s), databaseVersion and the foreign key lookups', () =>
    expectSameResult(SETUP, async (_lib, sequelize) => {
      const queryInterface = sequelize.getQueryInterface();
      // v6 describes `public` unless the schema is part of the table name.
      const schema = await schemaOf(sequelize);
      const columns = await queryInterface.assertTableHasColumn(
        { tableName: 'books', schema },
        'title',
      );
      return {
        quoted: [
          queryInterface.quoteIdentifier('users'),
          queryInterface.quoteIdentifiers('tenant.users'),
        ],
        version: typeof (await queryInterface.databaseVersion()),
        columns: Object.keys(columns),
        // v6 builds a broken query for `{ tableName, schema }` here, so plain names are compared.
        keys: await queryInterface.getForeignKeysForTables(['books', 'authors']),
      };
    }));

  it('assertTableHasColumn throws for a missing column', () =>
    expectSameError(SETUP, async (_lib, sequelize) => {
      await sequelize.getQueryInterface().assertTableHasColumn('books', 'missing');
    }));

  it('createDatabase and dropDatabase', () =>
    expectSameResult('', async (_lib, sequelize) => {
      const queryInterface = sequelize.getQueryInterface();
      const name = `pgz_cmp_${Math.random().toString(36).slice(2, 10)}`;
      const exists = async (): Promise<boolean> =>
        (
          (await sequelize.query('SELECT 1 FROM pg_database WHERE datname = :name', {
            replacements: { name },
            type: 'SELECT',
          })) as unknown[]
        ).length > 0;
      await queryInterface.createDatabase(name, { encoding: 'UTF8', template: 'template0' });
      const created = await exists();
      await queryInterface.dropDatabase(name);
      return { created, dropped: !(await exists()) };
    }));
});
