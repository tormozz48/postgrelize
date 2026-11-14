import { readdirSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { Sequelize } from '../../src/index.ts';
import { testDatabaseUrl } from '../support/db-url.ts';
import { withSchema } from '../support/with-schema.ts';

// Every documentation example runs against PostgreSQL: `export const run = (sequelize) => ...`.
type Example = Readonly<{
  run: (sequelize: Sequelize) => Promise<unknown>;
  minimumServerVersion?: number;
}>;

const directory = new URL('../../docs/examples/', import.meta.url);
const files = readdirSync(directory).filter((file) => file.endsWith('.ts'));

const opened: Sequelize[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((sequelize) => sequelize.close()));
});

describe('documentation examples', () => {
  it('has examples', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s runs', (file) =>
    withSchema(async ({ schema, client }) => {
      const example = (await import(new URL(file, directory).href)) as Example;
      const version = Number(
        (await client.query('SHOW server_version_num')).rows[0].server_version_num,
      );
      if (version < (example.minimumServerVersion ?? 0)) {
        return;
      }
      const sequelize = new Sequelize(testDatabaseUrl(), {
        logging: false,
        dialectOptions: { options: `-c search_path=${schema}` },
      });
      opened.push(sequelize);
      await expect(example.run(sequelize)).resolves.not.toThrow();
    }),
  );
});
