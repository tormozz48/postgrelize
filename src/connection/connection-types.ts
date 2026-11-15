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
  /** `statement_timeout` in milliseconds for this query only (`0` disables it). */
  statementTimeout?: number;
  transactionId?: string;
}>;
