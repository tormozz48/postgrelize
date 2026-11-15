import { createHash } from 'node:crypto';
import type { QueryResultRow } from 'pg';
import type { CompiledQuery } from '../sql/compile.ts';
import type { StatementCacheOptions } from './options.ts';

/** Minimal client surface the cache needs: the `pg` `query` overload with a config object. */
export type StatementClient = Readonly<{
  query: (config: {
    name?: string;
    text: string;
    values: unknown[];
  }) => Promise<{ rows: QueryResultRow[]; rowCount: number | null; command: string }>;
}>;

const DEFAULT_MAX = 100;
const MAX_TEXT_LENGTH = 8192;
const NAMEABLE = /^\s*(?:select|insert|update|delete|with)\b/i;
const STALE_PLAN = /cached plan must not change result type/i;

type Entries = Map<string, string | null>;

/**
 * Opt-in named prepared statements (ADR-023): names eligible statements `pgz_<hash of the SQL text>` so
 * PostgreSQL parses and plans them once per connection. Bounded per connection, never evicts.
 */
export class StatementCache {
  readonly #max: number;
  readonly #entries = new WeakMap<object, Entries>();

  /**
   * @param options - `true` for defaults, or `{ max }` statements per connection.
   * @throws Error when `max` is not a positive integer.
   */
  constructor(options: true | StatementCacheOptions) {
    const max = options === true ? undefined : options.max;
    if (max !== undefined && (!Number.isInteger(max) || max < 1)) {
      throw new Error(`statementCache.max must be a positive integer, got ${String(max)}`);
    }
    this.#max = max ?? DEFAULT_MAX;
  }

  /**
   * Runs a query on `client`, as a named statement when it is eligible.
   *
   * @param client - Connection to run on.
   * @param query - Compiled query.
   * @param retryable - Whether a stale-plan failure may be retried unnamed (false inside a transaction).
   * @returns The driver result.
   */
  async run(
    client: StatementClient,
    query: CompiledQuery,
    retryable: boolean,
  ): ReturnType<StatementClient['query']> {
    const entries = this.#entriesOf(client);
    const name = this.#name(entries, query.text);
    const values = query.values as unknown[];
    if (name === undefined) {
      return client.query({ text: query.text, values });
    }
    try {
      const result = await client.query({ name, text: query.text, values });
      entries.set(name, query.text);
      return result;
    } catch (error) {
      return StatementCache.#recover(client, query, { entries, name, retryable }, error);
    }
  }

  // A stale plan poisons the name on this connection: the server keeps the old statement, so the
  // text stays unnamed from now on.
  static async #recover(
    client: StatementClient,
    query: CompiledQuery,
    state: Readonly<{ entries: Entries; name: string; retryable: boolean }>,
    error: unknown,
  ): ReturnType<StatementClient['query']> {
    if (!STALE_PLAN.test(error instanceof Error ? error.message : '')) {
      throw error;
    }
    state.entries.set(state.name, null);
    if (!state.retryable) {
      throw error;
    }
    return client.query({ text: query.text, values: query.values as unknown[] });
  }

  #entriesOf(client: object): Entries {
    let entries = this.#entries.get(client);
    if (entries === undefined) {
      entries = new Map();
      this.#entries.set(client, entries);
    }
    return entries;
  }

  #name(entries: Entries, text: string): string | undefined {
    if (text.length > MAX_TEXT_LENGTH || text.includes(';') || !NAMEABLE.test(text)) {
      return undefined;
    }
    const name = `pgz_${createHash('sha256').update(text).digest('hex').slice(0, 16)}`;
    if (!entries.has(name)) {
      return entries.size < this.#max ? name : undefined;
    }
    return entries.get(name) === text ? name : undefined;
  }
}
