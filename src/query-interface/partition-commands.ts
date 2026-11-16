import {
  PartitionDdl,
  type CreatePartitionOptions,
  type DetachPartitionOptions,
} from '../ddl/partition-ddl.ts';
import type { PartitionBoundSpec } from '../ddl/partition-types.ts';
import type { TableName } from '../ddl/sql-literal.ts';
import type { QueryOptionsBase } from '../model/runtime.ts';
import type { StatementRunner } from './statement-runner.ts';

const partitions = new PartitionDdl();

/**
 * Declarative partitioning DDL of `QueryInterface`. Names are quoted, bound values are literals.
 *
 * @internal
 */
export class PartitionCommands {
  readonly #runner: StatementRunner;

  /**
   * @param runner - Statement runner.
   */
  constructor(runner: StatementRunner) {
    this.#runner = runner;
  }

  /**
   * Runs `CREATE TABLE ... PARTITION OF`.
   *
   * @param parent - Partitioned table.
   * @param partition - New partition.
   * @param bound - Bounds.
   * @param options - Partition and query options.
   */
  async create(
    parent: TableName,
    partition: TableName,
    bound: PartitionBoundSpec,
    options: CreatePartitionOptions & QueryOptionsBase,
  ): Promise<void> {
    await this.#runner.run(
      partitions.createPartitionSql(parent, partition, bound, options),
      options,
    );
  }

  /**
   * Runs `ALTER TABLE ... ATTACH PARTITION`.
   *
   * @param parent - Partitioned table.
   * @param partition - Existing table.
   * @param bound - Bounds.
   * @param options - Query options.
   */
  async attach(
    parent: TableName,
    partition: TableName,
    bound: PartitionBoundSpec,
    options: QueryOptionsBase,
  ): Promise<void> {
    await this.#runner.run(partitions.attachPartitionSql(parent, partition, bound), options);
  }

  /**
   * Runs `ALTER TABLE ... DETACH PARTITION`.
   *
   * @param parent - Partitioned table.
   * @param partition - Partition.
   * @param options - Detach and query options.
   */
  async detach(
    parent: TableName,
    partition: TableName,
    options: DetachPartitionOptions & QueryOptionsBase,
  ): Promise<void> {
    await this.#runner.run(partitions.detachPartitionSql(parent, partition, options), options);
  }
}
