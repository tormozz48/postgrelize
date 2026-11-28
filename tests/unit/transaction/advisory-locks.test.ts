import { describe, expect, it } from 'vitest';
import type { ConnectionManager } from '../../../src/connection/connection-manager.ts';
import { AdvisoryLocks } from '../../../src/transaction/advisory-locks.ts';

const setup = () => {
  const sent: unknown[] = [];
  const connections = {
    execute: async (query: unknown) => {
      sent.push(query);
      return { rows: [{ locked: true, unlocked: false }] };
    },
  } as unknown as ConnectionManager;
  return { sent, locks: new AdvisoryLocks(connections, () => ({})) };
};

describe('AdvisoryLocks SQL', () => {
  it('keeps the one-key statements', async () => {
    const { sent, locks } = setup();
    await locks.lock(['jobs:42']);
    await locks.lock([7n, { shared: true }]);
    await locks.tryLock([7]);
    expect(sent).toEqual([
      {
        text: 'SELECT pg_advisory_xact_lock(hashtextextended($1, 0)) AS "lock"',
        values: ['jobs:42'],
      },
      { text: 'SELECT pg_advisory_xact_lock_shared($1::bigint) AS "lock"', values: ['7'] },
      { text: 'SELECT pg_try_advisory_xact_lock($1::bigint) AS "locked"', values: ['7'] },
    ]);
  });

  it.each([
    [{}, 'pg_advisory_xact_lock', 'pg_try_advisory_xact_lock'],
    [{ shared: true }, 'pg_advisory_xact_lock_shared', 'pg_try_advisory_xact_lock_shared'],
    [{ session: true }, 'pg_advisory_lock', 'pg_try_advisory_lock'],
    [{ session: true, shared: true }, 'pg_advisory_lock_shared', 'pg_try_advisory_lock_shared'],
  ])('passes a key pair unhashed with %o', async (options, wait, attempt) => {
    const { sent, locks } = setup();
    await locks.lock([-1, 2, options]);
    expect(await locks.tryLock([-1, 2, options])).toBe(true);
    expect(sent).toEqual([
      { text: `SELECT ${wait}($1::int4, $2::int4) AS "lock"`, values: ['-1', '2'] },
      { text: `SELECT ${attempt}($1::int4, $2::int4) AS "locked"`, values: ['-1', '2'] },
    ]);
  });

  it('releases session locks', async () => {
    const { sent, locks } = setup();
    expect(await locks.unlock([1, 2])).toBe(false);
    await locks.unlock(['a', { shared: true }]);
    await locks.unlockAll();
    expect(sent).toEqual([
      { text: 'SELECT pg_advisory_unlock($1::int4, $2::int4) AS "unlocked"', values: ['1', '2'] },
      {
        text: 'SELECT pg_advisory_unlock_shared(hashtextextended($1, 0)) AS "unlocked"',
        values: ['a'],
      },
      { text: 'SELECT pg_advisory_unlock_all()', values: [] },
    ]);
  });

  it.each([
    ['a', 1],
    [1n, 1],
    [1.5, 1],
    [2 ** 31, 1],
    [1, -(2 ** 31) - 1],
    [1, Number.NaN],
    [1, '2'],
    [1, null],
  ])('rejects the pair (%s, %s) before running SQL', async (first, second) => {
    const { sent, locks } = setup();
    await expect(locks.lock([first, second as number])).rejects.toThrow(TypeError);
    expect(sent).toEqual([]);
  });
});
