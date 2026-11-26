/**
 * Whether a pooled client can still be used: not closed by anyone and not failed.
 *
 * @internal
 */
export class ConnectionHealth {
  readonly #failed = new WeakSet<object>();

  /**
   * Marks a client as failed.
   *
   * @param client - Pooled client.
   */
  invalidate(client: object): void {
    this.#failed.add(client);
  }

  /**
   * Checks a client; `pg` records a closed connection in private flags.
   *
   * @param client - Pooled client.
   * @returns False for a closed or failed client.
   */
  usable(client: object): boolean {
    return (
      !this.#failed.has(client) &&
      Reflect.get(client, '_ending') !== true &&
      Reflect.get(client, '_queryable') !== false
    );
  }
}
