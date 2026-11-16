/** Partitioning method of a partitioned table. */
export type PartitionStrategy = 'range' | 'list' | 'hash';

/** Marker of a `MINVALUE` / `MAXVALUE` bound inside a range partition bound. */
export type PartitionBoundMarker = Readonly<{
  /** Keyword the marker renders as. */
  keyword: 'MINVALUE' | 'MAXVALUE';
}>;

/**
 * `MINVALUE` and `MAXVALUE` for the `from` / `to` lists of a range partition bound. They are
 * markers, not strings, so a string value can never be read as a keyword.
 *
 * @example
 * ```ts
 * await queryInterface.createPartition('events', 'events_old', {
 *   from: [PartitionBound.MINVALUE],
 *   to: ['2020-01-01'],
 * });
 * ```
 */
export const PartitionBound = {
  /** Lowest possible value of a range column. */
  MINVALUE: Object.freeze<PartitionBoundMarker>({ keyword: 'MINVALUE' }),
  /** Highest possible value of a range column. */
  MAXVALUE: Object.freeze<PartitionBoundMarker>({ keyword: 'MAXVALUE' }),
} as const;

/** Element of a partition key: a column, or an expression (trusted SQL) with collation and operator class. */
export type PartitionKeyElement =
  | string
  | Readonly<{
      /** Column name. */
      name: string;
      /** Collation name. */
      collate?: string;
      /** Operator class. */
      operator?: string;
      /** Not used for a column element. */
      expression?: undefined;
    }>
  | Readonly<{
      /** Trusted SQL expression, wrapped in parentheses. */
      expression: string;
      /** Collation name. */
      collate?: string;
      /** Operator class. */
      operator?: string;
      /** Not used for an expression element. */
      name?: undefined;
    }>;

/**
 * Partition key of `createTable({ partitionBy })` and of a sub-partitioned partition.
 *
 * @example
 * ```ts
 * const key: PartitionKey = { strategy: 'range', columns: ['createdAt'] };
 * await queryInterface.createTable('events', { createdAt: DataTypes.DATE }, { partitionBy: key });
 * ```
 */
export type PartitionKey = Readonly<{
  /** `'range'`, `'list'` or `'hash'`. */
  strategy: PartitionStrategy;
  /** Key columns or expressions. */
  columns: readonly PartitionKeyElement[];
}>;

/**
 * Bounds of a partition: `{ in }` (list), `{ from, to }` (range; `PartitionBound.MINVALUE` /
 * `MAXVALUE` allowed), `{ modulus, remainder }` (hash) or `{ default: true }`. Values are rendered
 * as literals.
 *
 * @example
 * ```ts
 * const bound: PartitionBoundSpec = { from: ['2026-01-01'], to: ['2027-01-01'] };
 * await queryInterface.createPartition('events', 'events_2026', bound);
 * ```
 */
export type PartitionBoundSpec =
  | Readonly<{ in: readonly unknown[] }>
  | Readonly<{ from: readonly unknown[]; to: readonly unknown[] }>
  | Readonly<{ modulus: number; remainder: number }>
  | Readonly<{ default: true }>;
