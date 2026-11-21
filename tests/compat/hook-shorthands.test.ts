import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

type Adder = (name: unknown, fn?: unknown) => void;
type Hookable = Record<string, Adder> & {
  runHooks: (type: string, ...args: unknown[]) => Promise<void>;
  hasHook: (type: string) => boolean;
  removeHook: (type: string, name?: string) => unknown;
};

describe('hook shorthands match sequelize v6', () => {
  it('sequelize.beforeCreate / afterConnect / beforeBulkSync register global hooks', () =>
    expectSameResult('', async (_lib, sequelize) => {
      const target = sequelize as unknown as Hookable;
      const log: string[] = [];
      target['beforeCreate']!('named', () => log.push('named'));
      target['beforeCreate']!(() => log.push('anonymous'));
      target['beforeBulkSync']!(() => log.push('bulk'));
      await target.runHooks('beforeCreate');
      await target.runHooks('beforeBulkSync');
      const had = target.hasHook('beforeCreate');
      target.removeHook('beforeCreate', 'named');
      await target.runHooks('beforeCreate');
      return { log, had, has: target.hasHook('beforeCreate') };
    }));

  it('Model.beforeSync / afterSync run around Model.sync()', () =>
    expectSameResult('', async (lib, sequelize) => {
      const log: string[] = [];
      const Thing = sequelize.define('Thing', { name: lib.DataTypes.STRING });
      const model = Thing as unknown as Record<string, Adder>;
      model['beforeSync']!(() => log.push('before'));
      model['afterSync']!('after', () => log.push('after'));
      await Thing.sync({ force: true });
      return log;
    }));
});
