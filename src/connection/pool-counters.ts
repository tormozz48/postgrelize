import type { Pool } from 'pg';
import type { ConnectionPool, PoolCounters } from './connection-types.ts';

/** The part of a `pg.Pool` that the counters read. */
export type CountedPool = Pick<Pool, 'totalCount' | 'idleCount' | 'waitingCount'> &
  Readonly<{ options: Readonly<{ max?: number }> }>;

/** Live counters summed over one or more `pg` pools. */
export class PoolSum implements PoolCounters {
  readonly #pools: readonly CountedPool[];

  /**
   * @param pools - Pools to sum; none gives zeros.
   */
  constructor(pools: readonly CountedPool[]) {
    this.#pools = pools;
  }

  /** @inheritDoc */
  get size(): number {
    return this.#sum((pool) => pool.totalCount);
  }

  /** @inheritDoc */
  get available(): number {
    return this.#sum((pool) => pool.idleCount);
  }

  /** @inheritDoc */
  get using(): number {
    return this.size - this.available;
  }

  /** @inheritDoc */
  get waiting(): number {
    return this.#sum((pool) => pool.waitingCount);
  }

  /** @inheritDoc */
  get maxSize(): number {
    return this.#sum((pool) => pool.options.max ?? 10);
  }

  #sum(read: (pool: CountedPool) => number): number {
    return this.#pools.reduce((total, pool) => total + read(pool), 0);
  }
}

/** The `pool` of the connection manager: totals over every pool, plus the writer and the replicas when replication is configured. */
export class ManagerPools extends PoolSum implements ConnectionPool {
  /** @inheritDoc */
  readonly write: PoolCounters | undefined;
  /** @inheritDoc */
  readonly read: PoolCounters | undefined;

  /**
   * @param writer - Writer pool.
   * @param readers - Read replica pools; empty when replication is not configured.
   */
  constructor(writer: CountedPool, readers: readonly CountedPool[]) {
    super([writer, ...readers]);
    this.write = readers.length === 0 ? undefined : new PoolSum([writer]);
    this.read = readers.length === 0 ? undefined : new PoolSum(readers);
  }
}
