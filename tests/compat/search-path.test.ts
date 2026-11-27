import { describe, it } from 'vitest';
import { testDatabaseUrl } from '../support/db-url.ts';
import { expectSameResult, type Lib } from '../support/compat.ts';

type Sequelize = InstanceType<Lib['Sequelize']>;

// two schemas per library run, named after the scenario schema so parallel files do not collide
const withPaths = async (
  lib: Lib,
  base: Sequelize,
  options: object,
  run: (sequelize: Sequelize, one: string, two: string) => Promise<unknown>,
): Promise<unknown> => {
  const [rows] = await base.query('SELECT current_schema() AS name');
  const name = (rows[0] as { name: string }).name;
  const [one, two] = [`${name}_one`, `${name}_two`];
  const sequelize = new lib.Sequelize(testDatabaseUrl(), { logging: false, ...options });
  try {
    await base.query(`CREATE SCHEMA ${one}; CREATE SCHEMA ${two}`);
    return await run(sequelize, one, two);
  } finally {
    await sequelize.close();
    await base.query(`DROP SCHEMA IF EXISTS ${one} CASCADE; DROP SCHEMA IF EXISTS ${two} CASCADE`);
  }
};

const items = (lib: Lib, sequelize: Sequelize) =>
  sequelize.define('Item', { name: lib.DataTypes.STRING }, { tableName: 'items' });

const prepend = { dialectOptions: { prependSearchPath: true } };

describe('compat: searchPath', () => {
  it('routes sync, writes and reads to the schema of the path', () =>
    expectSameResult('', (lib, base) =>
      withPaths(lib, base, prepend, async (sequelize, one, two) => {
        const Item = items(lib, sequelize);
        const [first, second] = [{ searchPath: `${one},public` }, { searchPath: `${two},public` }];
        await Item.sync(first as never);
        await Item.sync(second as never);
        const created = await Item.create({ name: 'a' }, first as never);
        await Item.create({ name: 'b' }, second as never);
        await created.update({ name: 'c' }, first as never);
        await Item.bulkCreate([{ name: 'd' }], second as never);
        const names = async (options: object) =>
          (await Item.findAll({ ...options, order: [['id', 'ASC']] })).map((row) =>
            row.get('name'),
          );
        return {
          one: await names(first),
          two: await names(second),
          count: await Item.count(second as never),
          found: (await Item.findByPk(1, first as never))?.get('name'),
          inTransaction: await sequelize.transaction(async (transaction) => [
            await names({ ...second, transaction }),
            await names({ ...first, transaction }),
          ]),
          destroyed: await Item.destroy({ where: { name: 'b' }, ...second } as never),
        };
      }),
    ));

  it('uses the instance searchPath, which a query overrides', () =>
    expectSameResult('', (lib, base) =>
      withPaths(lib, base, {}, async (_unused, one, two) => {
        const sequelize = new lib.Sequelize(testDatabaseUrl(), {
          logging: false,
          searchPath: one,
          ...prepend,
        } as never);
        try {
          await sequelize.query('CREATE TABLE t (a int)');
          await sequelize.query('CREATE TABLE t (a int, b int)', { searchPath: two } as never);
          const columns = async (options: object): Promise<string[]> => {
            const [rows] = (await sequelize.query(
              'INSERT INTO t (a) VALUES (1) RETURNING *',
              options,
            )) as [object[], unknown];
            return Object.keys(rows[0] as object);
          };
          return [await columns({}), await columns({ searchPath: two })];
        } finally {
          await sequelize.close();
        }
      }),
    ));

  it('ignores searchPath without prependSearchPath', () =>
    expectSameResult('', (lib, base) =>
      withPaths(lib, base, {}, async (sequelize, one) => {
        const [rows] = (await sequelize.query("SELECT current_setting('search_path') AS path", {
          searchPath: one,
        } as never)) as [object[], unknown];
        return rows;
      }),
    ));
});
