import { describe, expect, it } from 'vitest';
import { ManagerPools, PoolSum, type CountedPool } from '../../../src/connection/pool-counters.ts';

const pool = (
  totalCount: number,
  idleCount: number,
  waitingCount: number,
  max?: number,
): CountedPool => ({
  totalCount,
  idleCount,
  waitingCount,
  options: max === undefined ? {} : { max },
});

describe('PoolSum', () => {
  it('maps totalCount, idleCount and waitingCount and derives using', () => {
    const counters = new PoolSum([pool(4, 1, 2, 5)]);
    expect(counters).toMatchObject({ size: 4, available: 1, using: 3, waiting: 2, maxSize: 5 });
  });

  it('uses the pg default of 10 when max is not configured', () => {
    expect(new PoolSum([pool(0, 0, 0)]).maxSize).toBe(10);
  });

  it('sums several pools and reads them live', () => {
    const first = { ...pool(1, 1, 0, 2) } as { totalCount: number } & CountedPool;
    const counters = new PoolSum([first, pool(2, 0, 3, 3)]);
    expect(counters).toMatchObject({ size: 3, available: 1, using: 2, waiting: 3, maxSize: 5 });
    first.totalCount = 2;
    expect(counters.size).toBe(4);
  });

  it('is all zeros for no pools', () => {
    expect(new PoolSum([])).toMatchObject({
      size: 0,
      available: 0,
      using: 0,
      waiting: 0,
      maxSize: 0,
    });
  });
});

describe('ManagerPools', () => {
  it('has no read / write split without replicas', () => {
    const pools = new ManagerPools(pool(1, 0, 0, 5), []);
    expect(pools).toMatchObject({ size: 1, using: 1, maxSize: 5 });
    expect(pools.read).toBeUndefined();
    expect(pools.write).toBeUndefined();
  });

  it('totals the writer and every replica and splits them with replicas', () => {
    const pools = new ManagerPools(pool(2, 1, 0, 5), [pool(1, 0, 1, 3), pool(3, 3, 0, 3)]);
    expect(pools).toMatchObject({ size: 6, available: 4, using: 2, waiting: 1, maxSize: 11 });
    expect(pools.write).toMatchObject({ size: 2, using: 1, maxSize: 5 });
    expect(pools.read).toMatchObject({ size: 4, available: 3, using: 1, waiting: 1, maxSize: 6 });
  });
});
