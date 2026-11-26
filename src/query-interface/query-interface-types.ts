import type { PartitionKey } from '../ddl/partition-types.ts';
import type { QueryOptionsBase } from '../model/runtime.ts';

/** Column description returned by `describeTable` (Sequelize v6 shape). */
export type ColumnDescription = Readonly<{
  /** Upper-case SQL type, e.g. `'CHARACTER VARYING(255)'`. */
  type: string;
  /** Whether `NULL` is allowed. */
  allowNull: boolean;
  /** Default expression without casts and quotes. */
  defaultValue: unknown;
  /** Column comment. */
  comment: string | null;
  /** Enum labels. */
  special: readonly string[];
  /** Part of the primary key. */
  primaryKey: boolean;
}>;

/** Foreign key column of a table. */
export type ForeignKeyReference = Readonly<{
  /** Constraint name. */
  constraintName: string;
  /** Referencing column. */
  columnName: string;
  /** Referenced table. */
  referencedTableName: string;
  /** Referenced column. */
  referencedColumnName: string;
}>;

/**
 * Options of `createTable`: a table comment, the table persistence and the common query options.
 *
 * @example
 * ```ts
 * const options: CreateTableOptions = { comment: 'Blog posts', transaction };
 * await queryInterface.createTable('posts', { title: DataTypes.STRING }, options);
 * await queryInterface.createTable('scratch', { n: DataTypes.INTEGER }, { temporary: true, transaction });
 * await queryInterface.createTable('events', { at: DataTypes.DATE }, { partitionBy: { strategy: 'range', columns: ['at'] } });
 * ```
 */
export type CreateTableOptions = QueryOptionsBase &
  Readonly<{
    /** Schema of a table given by name alone. */
    schema?: string;
    /** Table comment. */
    comment?: string;
    /** `CREATE UNLOGGED TABLE`: not written to the WAL, faster writes, emptied after a crash and not replicated. */
    unlogged?: boolean;
    /** `CREATE TEMPORARY TABLE`: lives as long as the database session (one pooled connection, so pass a `transaction` or use `pool.max = 1`), is dropped automatically and cannot have a schema. Cannot be combined with `unlogged`. */
    temporary?: boolean;
    /** `PARTITION BY RANGE | LIST | HASH (...)`: creates a partitioned table; add partitions with `createPartition`. PostgreSQL requires primary and unique keys to include the partition columns. */
    partitionBy?: PartitionKey;
  }>;

/**
 * Options of `dropTable`: `cascade` plus the common query options.
 *
 * @example
 * ```ts
 * const options: DropTableOptions = { cascade: true };
 * await queryInterface.dropTable('posts', options);
 * ```
 */
export type DropTableOptions = QueryOptionsBase &
  Readonly<{
    /** `DROP TABLE ... CASCADE`. */
    cascade?: boolean;
  }>;
