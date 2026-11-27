import { describe, expect, it } from 'vitest';
import { expectSameResult, libraries, runScenario, type Lib } from '../support/compat.ts';
import { testDatabaseUrl } from '../support/db-url.ts';
import { withSchema } from '../support/with-schema.ts';

const race = (lib: Lib): Promise<unknown> =>
  withSchema(async ({ schema }) => {
    const sequelize = new lib.Sequelize(testDatabaseUrl(), {
      logging: false,
      pool: { max: 2, acquire: 5000 },
      dialectOptions: { options: `-c search_path=${schema}` },
    });
    try {
      const Item = sequelize.define('Item', {
        sku: { type: lib.DataTypes.STRING, unique: true },
      });
      await sequelize.sync();
      const results = await Promise.all(
        Array.from({ length: 10 }, () => Item.findOrCreate({ where: { sku: 'x' } })),
      );
      return [results.filter(([, created]) => created).length, await Item.count()];
    } finally {
      await sequelize.close();
    }
  });

const findHookTransactions = async (
  ...[lib, sequelize]: Parameters<Parameters<typeof runScenario>[2]>
) => {
  const Item = sequelize.define('Item', { sku: lib.DataTypes.STRING });
  await sequelize.sync();
  const seen: boolean[] = [];
  Item.addHook('beforeFind', (options: { transaction?: unknown }) => {
    seen.push(Boolean(options.transaction));
  });
  await Item.findOrCreate({ where: { sku: 'x' } });
  return seen;
};

describe('compat: findOrCreate with a small pool', () => {
  it('concurrent calls on one key finish with one row', async () => {
    expect(await race(libraries.sequelize)).toEqual([1, 1]);
    expect(await race(libraries.postgrelize)).toEqual([1, 1]);
  });

  it('runs the find in the same transaction as the create', async () => {
    expect(await runScenario(libraries.postgrelize, '', findHookTransactions)).toEqual(
      await runScenario(libraries.sequelize, '', findHookTransactions),
    );
  });
  it('concurrent calls in one caller transaction return the same row', () =>
    expectSameResult('', async (lib, sequelize) => {
      const Item = sequelize.define('Item', {
        sku: { type: lib.DataTypes.STRING, unique: true },
      });
      await sequelize.sync();
      return sequelize.transaction(async (transaction) => {
        const results = await Promise.all(
          [1, 2].map(() => Item.findOrCreate({ where: { sku: 'x' }, transaction })),
        );
        return [results.filter(([, created]) => created).length, await Item.count({ transaction })];
      });
    }));

  it('lets a hook of the created row use the caller transaction', () =>
    expectSameResult('', async (lib, sequelize) => {
      const Tag = sequelize.define('Tag', { name: lib.DataTypes.STRING });
      const Item = sequelize.define('Item', { sku: lib.DataTypes.STRING });
      await sequelize.sync();
      return sequelize.transaction(async (transaction) => {
        Item.addHook('afterCreate', async () => {
          await Tag.findOrCreate({ where: { name: 't' }, transaction });
        });
        await Item.findOrCreate({ where: { sku: 'x' }, transaction });
        return [await Item.count({ transaction }), await Tag.count({ transaction })];
      });
    }));
});
