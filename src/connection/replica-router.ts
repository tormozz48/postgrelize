/** Chooses the pool a query runs on: the writer, or the next read replica in round-robin order. */
export class ReplicaRouter<P> {
  /** Writer pool. */
  readonly writer: P;
  /** Read replica pools (may be empty). */
  readonly readers: readonly P[];
  #next = 0;

  /**
   * @param writer - Writer pool.
   * @param readers - Read replica pools.
   */
  constructor(writer: P, readers: readonly P[]) {
    this.writer = writer;
    this.readers = readers;
  }

  /**
   * Pool for a query.
   *
   * @param route - `'read'` to use a replica when one is configured; anything else uses the writer.
   * @returns Chosen pool.
   */
  pool(route: 'read' | 'write' | undefined): P {
    const readers = this.readers;
    if (route !== 'read' || readers.length === 0) {
      return this.writer;
    }
    const reader = readers[this.#next % readers.length] ?? this.writer;
    this.#next += 1;
    return reader;
  }
}
