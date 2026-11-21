import { Client as PgClient, type PoolConfig } from 'pg';

type PoolClientClass = NonNullable<PoolConfig['Client']>;
type ConnectCallback = (error: Error) => void;

/** Errors thrown by an `afterConnect` hook; v6 surfaces them unchanged, so they skip connection error mapping. */
export const hookFailures = new WeakSet<object>();

const runAfterConnect = async (
  client: PgClient,
  run: (client: PgClient) => Promise<void>,
): Promise<void> => {
  try {
    await run(client);
  } catch (error) {
    if (typeof error === 'object' && error !== null) {
      hookFailures.add(error);
    }
    client.end().catch(() => {});
    throw error;
  }
};

const settle = (connected: Promise<unknown>, callback: ConnectCallback): void => {
  connected.then(
    () => (callback as unknown as (error: null) => void)(null),
    (error: unknown) => callback(error as Error),
  );
};

/**
 * Runs the `afterConnect` hook on every new pooled connection, before the pool hands it out.
 * `pg` has no portable async connect hook (`onConnect` needs a recent `pg-pool`), so the pool
 * is given a `pg.Client` subclass whose `connect()` runs the hook once the client is connected;
 * when the hook throws the client is closed and the error reaches the caller of the query.
 */
export class AfterConnectHook {
  readonly #run: (client: PgClient) => Promise<void>;

  /**
   * @param run - Hook runner; receives the connected client.
   */
  constructor(run: (client: PgClient) => Promise<void>) {
    this.#run = run;
  }

  /**
   * Client class for the `Client` pool option.
   *
   * @returns `pg.Client` subclass that runs the hook after connecting.
   */
  clientClass(): PoolClientClass {
    const run = this.#run;
    class HookedClient extends PgClient {
      override connect(): Promise<this>;
      override connect(callback: ConnectCallback): void;
      override connect(callback?: ConnectCallback): Promise<this> | void {
        const connected = super
          .connect()
          .then(() => runAfterConnect(this, run))
          .then(() => this);
        return callback === undefined ? connected : settle(connected, callback);
      }
    }
    return HookedClient as unknown as PoolClientClass;
  }
}
