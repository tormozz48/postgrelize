import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: what instance destroy and restore resolve with', () => {
  it('a soft delete and a restore resolve with the instance', () =>
    expectSameResult('', async (lib, sequelize) => {
      const Paranoid = sequelize.define(
        'ParanoidUser',
        { username: lib.DataTypes.STRING, destroyTime: lib.DataTypes.DATE },
        { paranoid: true, deletedAt: 'destroyTime' },
      );
      const Plain = sequelize.define('PlainUser', { username: lib.DataTypes.STRING });
      await sequelize.sync({ force: true });
      const soft = await Paranoid.create({ username: 'a' });
      const softResult = (await soft.destroy()) as unknown as
        | { get(key: string): unknown }
        | undefined;
      const restored = (await soft.restore()) as unknown as
        | { get(key: string): unknown }
        | undefined;
      const hard = await Paranoid.create({ username: 'b' });
      await hard.destroy({ force: true });
      await (await Plain.create({ username: 'c' })).destroy();
      return {
        softIsInstance: softResult === (soft as unknown),
        softHasDeleteTime: softResult?.get('destroyTime') instanceof Date,
        restoredIsInstance: restored === (soft as unknown),
        restoredDeleteTime: restored?.get('destroyTime') ?? null,
      };
    }));
});
