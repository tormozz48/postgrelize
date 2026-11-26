import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

class Missing extends Error {
  override name = 'Missing';
}

const outcome = async (run: () => Promise<unknown>): Promise<unknown> =>
  run().then(
    (value) => (Array.isArray(value) ? value.length : value === null ? null : 'row'),
    (error: Error) => error.name,
  );

describe('compat: rejectOnEmpty', () => {
  it('applies to findAll, findOne and findByPk, from the query or the model option', () =>
    expectSameResult('', async (lib, sequelize) => {
      const { STRING } = lib.DataTypes;
      const Strict = sequelize.define('Strict', { u: STRING }, { rejectOnEmpty: true });
      const Custom = sequelize.define('Custom', { u: STRING }, { rejectOnEmpty: new Missing() });
      const Plain = sequelize.define('Plain', { u: STRING });
      await sequelize.sync({ force: true });
      const where = { u: 'none' };
      const results: unknown[] = [];
      for (const model of [Strict, Custom, Plain]) {
        results.push(
          await outcome(() => model.findAll({ where })),
          await outcome(() => model.findOne({ where })),
          await outcome(() => model.findByPk(99)),
          await outcome(() => model.findAll({ where, rejectOnEmpty: false })),
          await outcome(() => model.findOne({ where, rejectOnEmpty: Missing as never })),
          await outcome(() => model.findAll({ where, rejectOnEmpty: true })),
          await outcome(() => model.findAndCountAll({ where })),
        );
      }
      await Strict.create({ u: 'a' });
      results.push(
        await outcome(() => Strict.findAll()),
        await outcome(() => Strict.findOrCreate({ where: { u: 'new' } })),
      );
      return results;
    }));
});
