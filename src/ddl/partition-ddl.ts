import { DdlGuards } from './ddl-guards.ts';
import { IndexElementDdl } from './index-element-ddl.ts';
import {
  PartitionBound,
  type PartitionBoundSpec,
  type PartitionKey,
  type PartitionStrategy,
} from './partition-types.ts';
import { SqlLiteral, type TableName } from './sql-literal.ts';

const guards = new DdlGuards();

const elements = new IndexElementDdl();

const sqlLiteral = new SqlLiteral();

const STRATEGIES: ReadonlySet<string> = new Set<PartitionStrategy>(['range', 'list', 'hash']);

/**
 * Options of `createPartition`. PostgreSQL extension.
 *
 * @example
 * ```ts
 * await queryInterface.createPartition(
 *   'events',
 *   'events_2026',
 *   { from: ['2026-01-01'], to: ['2027-01-01'] },
 *   { ifNotExists: true, partitionBy: { strategy: 'list', columns: ['kind'] } },
 * );
 * ```
 */
export type CreatePartitionOptions = Readonly<{
  /** Makes the partition itself partitioned. */
  partitionBy?: PartitionKey;
  /** `IF NOT EXISTS`. */
  ifNotExists?: boolean;
}>;

/**
 * Options of `detachPartition`. PostgreSQL extension.
 *
 * @example
 * ```ts
 * await queryInterface.detachPartition('events', 'events_2026', { concurrently: true });
 * ```
 */
export type DetachPartitionOptions = Readonly<{
  /** `DETACH PARTITION ... CONCURRENTLY` (cannot run inside a transaction). */
  concurrently?: boolean;
  /** `DETACH PARTITION ... FINALIZE`, completing an interrupted concurrent detach. */
  finalize?: boolean;
}>;

/**
 * Declarative partitioning statements: `PARTITION BY`, `PARTITION OF`, `ATTACH` and `DETACH`.
 *
 * @internal
 */
export class PartitionDdl {
  /**
   * ` PARTITION BY ...` clause of `CREATE TABLE`.
   *
   * @param key - Strategy and key columns.
   * @returns Clause with a leading space.
   * @throws Error for an unknown strategy, no columns or an invalid operator class.
   */
  partitionBySql(key: PartitionKey): string {
    if (!STRATEGIES.has(key.strategy)) {
      throw new Error(`Invalid partition strategy: ${String(key.strategy)}`);
    }
    if (key.columns.length === 0) {
      throw new Error('Partition key requires at least one column');
    }
    const columns = key.columns.map((column) => elements.elementSql(column, undefined)).join(', ');
    return ` PARTITION BY ${key.strategy.toUpperCase()} (${columns})`;
  }

  /**
   * `CREATE TABLE ... PARTITION OF` statement.
   *
   * @param parent - Partitioned table.
   * @param partition - New partition name.
   * @param bound - Bounds.
   * @param options - Sub-partitioning and `ifNotExists`.
   * @returns Statement.
   */
  createPartitionSql(
    parent: TableName,
    partition: TableName,
    bound: PartitionBoundSpec,
    options: CreatePartitionOptions = {},
  ): string {
    const head = `CREATE TABLE ${options.ifNotExists === true ? 'IF NOT EXISTS ' : ''}${sqlLiteral.quoteTable(partition)}`;
    const sub = options.partitionBy === undefined ? '' : this.partitionBySql(options.partitionBy);
    return `${head} PARTITION OF ${sqlLiteral.quoteTable(parent)} ${this.boundSql(bound)}${sub}`;
  }

  /**
   * `ALTER TABLE ... ATTACH PARTITION` statement.
   *
   * @param parent - Partitioned table.
   * @param partition - Existing table to attach.
   * @param bound - Bounds.
   * @returns Statement.
   */
  attachPartitionSql(parent: TableName, partition: TableName, bound: PartitionBoundSpec): string {
    return `ALTER TABLE ${sqlLiteral.quoteTable(parent)} ATTACH PARTITION ${sqlLiteral.quoteTable(partition)} ${this.boundSql(bound)}`;
  }

  /**
   * `ALTER TABLE ... DETACH PARTITION` statement.
   *
   * @param parent - Partitioned table.
   * @param partition - Partition to detach.
   * @param options - `concurrently` or `finalize`.
   * @returns Statement.
   * @throws Error when both options are set.
   */
  detachPartitionSql(
    parent: TableName,
    partition: TableName,
    options: DetachPartitionOptions = {},
  ): string {
    if (options.concurrently === true && options.finalize === true) {
      throw new Error('concurrently and finalize cannot be combined');
    }
    const mode =
      options.concurrently === true
        ? ' CONCURRENTLY'
        : options.finalize === true
          ? ' FINALIZE'
          : '';
    return `ALTER TABLE ${sqlLiteral.quoteTable(parent)} DETACH PARTITION ${sqlLiteral.quoteTable(partition)}${mode}`;
  }

  /**
   * `FOR VALUES ...` or `DEFAULT` clause.
   *
   * @param bound - Bounds.
   * @returns Clause.
   * @throws Error for an unknown bound shape or non-integer modulus / remainder.
   */
  boundSql(bound: PartitionBoundSpec): string {
    if ('default' in bound) {
      return 'DEFAULT';
    }
    if ('in' in bound) {
      return `FOR VALUES IN (${this.#values(bound.in)})`;
    }
    if ('from' in bound) {
      return `FOR VALUES FROM (${this.#values(bound.from)}) TO (${this.#values(bound.to)})`;
    }
    if ('modulus' in bound) {
      return `FOR VALUES WITH (MODULUS ${guards.integer(bound.modulus, 'modulus')}, REMAINDER ${guards.integer(bound.remainder, 'remainder')})`;
    }
    throw new Error(
      'Partition bound must be { in }, { from, to }, { modulus, remainder } or { default: true }',
    );
  }

  #values(values: readonly unknown[]): string {
    if (values.length === 0) {
      throw new Error('Partition bound needs at least one value');
    }
    return values
      .map((value) =>
        value === PartitionBound.MINVALUE || value === PartitionBound.MAXVALUE
          ? (value as { keyword: string }).keyword
          : sqlLiteral.escape(value),
      )
      .join(', ');
  }
}
