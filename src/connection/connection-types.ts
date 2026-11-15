import type { PoolClient, QueryResultRow } from 'pg';
import type { LoggingFunction } from './options.ts';

/** Result of one executed statement. */
export type QueryResult = Readonly<{
  rows: readonly QueryResultRow[];
  rowCount: number;
  command: string;
}>;

/** Database client a query runs on: a pool connection held by a transaction. */
export type Client = Pick<PoolClient, 'query' | 'release'>;

/** Per-call execution settings. */
export type ExecuteOptions = Readonly<{
  client?: Client;
  /** Run on a read replica when one is configured (ignored when `client` is set). */
  route?: 'read' | 'write';
  logging?: LoggingFunction | false;
  benchmark?: boolean;
  transactionId?: string;
}>;
