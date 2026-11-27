import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

type Loose = Record<string, (...args: unknown[]) => Promise<unknown>>;

describe('compat: arguments of createFunction', () => {
  it('accepts null options and reports v6 messages', () =>
    expectSameResult('', async (_lib, sequelize) => {
      const qi = sequelize.getQueryInterface() as unknown as Loose;
      const params = [{ type: 'varchar', name: 'test' }];
      const outcome = (...args: unknown[]) =>
        qi['createFunction']!(...args).then(
          () => 'ok',
          (error: Error) => error.message.replace(/\?.*$/, '?'),
        );
      const create = (...rest: unknown[]) =>
        outcome('job', params, 'varchar', 'plpgsql', 'return test;', ...rest);
      const results = [
        await create(null),
        await create(null, { force: true }),
        await create({}, { force: true }),
        await outcome(null, params, 'integer', 'plpgsql', 'return 1;', []),
        await outcome('f', [{ name: 'x' }], 'integer', 'plpgsql', 'return 1;', []),
        await outcome('f', [], null, 'plpgsql', 'return 1;', []),
        await outcome('f', [], 'integer', 'plpgsql', 'return 1;', [], { variables: 100 }),
        await outcome('f', [], 'integer', 'plpgsql', 'return 1;', [], {
          variables: [{ name: 'v' }],
        }),
      ];
      await qi['dropFunction']!('job', params);
      return results;
    }));
});
