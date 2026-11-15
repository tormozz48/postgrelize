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

/** Options of `createTable`. */
export type CreateTableOptions = QueryOptionsBase &
  Readonly<{
    /** Table comment. */
    comment?: string;
  }>;

/** Options of `dropTable`. */
export type DropTableOptions = QueryOptionsBase &
  Readonly<{
    /** `DROP TABLE ... CASCADE`. */
    cascade?: boolean;
  }>;
