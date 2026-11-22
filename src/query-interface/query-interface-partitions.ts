import type { CreatePartitionOptions, DetachPartitionOptions } from '../ddl/partition-ddl.ts';
import type { PartitionBoundSpec } from '../ddl/partition-types.ts';
import type { TableName } from '../ddl/sql-literal.ts';
import type { QueryOptionsBase, RuntimeOwner } from '../model/runtime.ts';
import { PartitionCommands } from './partition-commands.ts';
import { QueryInterfacePolicies } from './query-interface-policies.ts';
import { StatementRunner } from './statement-runner.ts';

/**
 * Declarative partitioning part of {@link QueryInterface}.
 */
export class QueryInterfacePartitions extends QueryInterfacePolicies {
  readonly #partitions: PartitionCommands;

  /**
   * @param sequelize - Owning `Sequelize` instance.
   */
  constructor(sequelize: RuntimeOwner) {
    super(sequelize);
    this.#partitions = new PartitionCommands(new StatementRunner(sequelize));
  }

  /**
   * Creates a partition of a partitioned table (`CREATE TABLE ... PARTITION OF`). The partitioned parent comes from `createTable` with `partitionBy`.
   *
   * @postgrelize
   * @param parent - Partitioned table name or `{ tableName, schema }`.
   * @param partition - New partition name or `{ tableName, schema }`.
   * @param bound - `{ in }` (list), `{ from, to }` (range), `{ modulus, remainder }` (hash) or `{ default: true }`; values are rendered as literals.
   * @param options - `partitionBy` (sub-partitioning), `ifNotExists` and query options.
   *
   * @example
   * ```ts
   * await queryInterface.createTable('events', { at: DataTypes.DATE }, {
   *   partitionBy: { strategy: 'range', columns: ['at'] },
   * });
   * await queryInterface.createPartition('events', 'events_2026', {
   *   from: ['2026-01-01'],
   *   to: ['2027-01-01'],
   * });
   * ```
   * @see [Constraints and indexes guide](/guide/constraints-indexes)
   */
  async createPartition(
    parent: TableName,
    partition: TableName,
    bound: PartitionBoundSpec,
    options: CreatePartitionOptions & QueryOptionsBase = {},
  ): Promise<void> {
    await this.#partitions.create(parent, partition, bound, options);
  }

  /**
   * Attaches an existing table as a partition (`ALTER TABLE ... ATTACH PARTITION`). PostgreSQL scans the table to check the bounds unless a matching `CHECK` constraint exists.
   *
   * @postgrelize
   * @param parent - Partitioned table name or `{ tableName, schema }`.
   * @param partition - Existing table name or `{ tableName, schema }`.
   * @param bound - Partition bounds, see {@link QueryInterface.createPartition}.
   * @param options - Query options.
   *
   * @example
   * ```ts
   * await queryInterface.attachPartition('events', 'events_2027', {
   *   from: ['2027-01-01'],
   *   to: ['2028-01-01'],
   * });
   * ```
   */
  async attachPartition(
    parent: TableName,
    partition: TableName,
    bound: PartitionBoundSpec,
    options: QueryOptionsBase = {},
  ): Promise<void> {
    await this.#partitions.attach(parent, partition, bound, options);
  }

  /**
   * Detaches a partition, keeping it as a standalone table (`ALTER TABLE ... DETACH PARTITION`).
   *
   * @postgrelize
   * @param parent - Partitioned table name or `{ tableName, schema }`.
   * @param partition - Partition name or `{ tableName, schema }`.
   * @param options - `concurrently` (PostgreSQL 14+, not inside a transaction), `finalize` and query options.
   *
   * @example
   * ```ts
   * await queryInterface.detachPartition('events', 'events_2026', { concurrently: true });
   * ```
   */
  async detachPartition(
    parent: TableName,
    partition: TableName,
    options: DetachPartitionOptions & QueryOptionsBase = {},
  ): Promise<void> {
    await this.#partitions.detach(parent, partition, options);
  }
}
