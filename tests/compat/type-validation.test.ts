import { describe, it } from 'vitest';
import type { Sequelize } from '../../src/index.ts';
import { expectSameResult, type Lib } from '../support/compat.ts';

type Failure = { name: string; errors?: { path: string; validatorKey: string }[] };

const outcome = async (run: () => Promise<unknown>): Promise<unknown> =>
  run().then(
    () => 'ok',
    (error: Failure) => [error.name, error.errors?.map((e) => [e.path, e.validatorKey])],
  );

const checked = (lib: Lib, sequelize: Sequelize): Sequelize =>
  new lib.Sequelize(
    `postgres://${sequelize.config.username}:${sequelize.config.password ?? ''}@${sequelize.config.host}:${sequelize.config.port}/${sequelize.config.database}`,
    {
      logging: false,
      typeValidation: true,
      dialectOptions: (sequelize as unknown as { options: { dialectOptions: object } }).options
        .dialectOptions,
    },
  );

describe('compat: typeValidation option', () => {
  it('rejects values that do not fit their data type on writes and in where', () =>
    expectSameResult('', async (lib, plain) => {
      const sequelize = checked(lib, plain);
      const { STRING, INTEGER, DECIMAL, BOOLEAN, UUID, DATE, ENUM, TEXT } = lib.DataTypes;
      const Item = sequelize.define('Item', {
        name: STRING,
        body: TEXT,
        age: INTEGER,
        price: DECIMAL,
        flag: BOOLEAN,
        uid: UUID,
        at: DATE,
        state: ENUM('a', 'b'),
      });
      await sequelize.sync({ force: true });
      const writes: Record<string, unknown>[] = [
        { age: '12', price: '12.6', name: 12, flag: 'true', at: '2000-12-16', state: 'a' },
        { age: 'jan' },
        { age: 4.5 },
        { price: 'x' },
        { body: 12 },
        { flag: 'maybe' },
        { uid: 'nope' },
        { state: 'fnord' },
      ];
      const results: unknown[] = [];
      for (const values of writes) {
        results.push(await outcome(() => Item.create(values)));
        results.push(await outcome(() => Item.update(values, { where: {} })));
      }
      results.push(await outcome(() => Item.findAll({ where: { age: 'jan' } })));
      results.push(await outcome(() => Item.findAll({ where: { age: ['1', 'x'] } })));
      results.push(await outcome(() => Item.findAll({ where: { name: { [lib.Op.like]: 'a%' } } })));
      await sequelize.close();
      return results;
    }));
});
