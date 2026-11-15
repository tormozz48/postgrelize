import type { DataType } from '../data-types/data-types.ts';
import type { AttributeDefinition } from '../model/model-definition.ts';
import type { TableName } from './sql-literal.ts';

/** `Deferrable` setting of a foreign key or transaction (Sequelize v6 `Deferrable`). */
export type DeferrableValue = Readonly<{
  /** SQL of the mode, e.g. `DEFERRABLE INITIALLY DEFERRED`. */
  sql: string;
}>;

/**
 * Deferrable constraint modes (Sequelize v6 `Deferrable`).
 *
 * @example
 * ```ts
 * references: { model: 'Users', key: 'id', deferrable: Deferrable.INITIALLY_DEFERRED }
 * ```
 */
export const Deferrable = {
  /** `DEFERRABLE INITIALLY IMMEDIATE`. */
  INITIALLY_IMMEDIATE: Object.freeze<DeferrableValue>({ sql: 'DEFERRABLE INITIALLY IMMEDIATE' }),
  /** `DEFERRABLE INITIALLY DEFERRED`. */
  INITIALLY_DEFERRED: Object.freeze<DeferrableValue>({ sql: 'DEFERRABLE INITIALLY DEFERRED' }),
  /** `NOT DEFERRABLE`. */
  NOT: Object.freeze<DeferrableValue>({ sql: 'NOT DEFERRABLE' }),
} as const;

/** Column definition as used by DDL builders. */
export type ColumnDefinition = Readonly<{
  name: string;
  field: string;
  type: DataType;
  allowNull: boolean;
  primaryKey: boolean;
  autoIncrement: boolean;
  defaultValue: unknown;
  unique: AttributeDefinition['unique'];
  comment: string | undefined;
  references: AttributeDefinition['references'];
  onDelete: string | undefined;
  onUpdate: string | undefined;
  identity: 'always' | 'byDefault' | undefined;
  generated: AttributeDefinition['generated'];
}>;

/** Index field: a column name or `{ name, order, collate, operator, length }`. */
export type IndexField =
  | string
  | Readonly<{
      /** Column name. */
      name: string;
      /** `ASC` / `DESC`. */
      order?: 'ASC' | 'DESC';
      /** Collation. */
      collate?: string;
      /** Operator class, e.g. `'jsonb_path_ops'`. */
      operator?: string;
    }>;

/** Options of `addIndex` and model `indexes` (Sequelize v6 `IndexesOptions`). */
export type IndexOptions = Readonly<{
  /** Indexed columns. */
  fields?: readonly IndexField[];
  /** Index name; default `underscore(<table>_<fields>)`. */
  name?: string;
  /** Unique index. */
  unique?: boolean;
  /** `NULLS NOT DISTINCT` for unique indexes. PostgreSQL extension. */
  nullsNotDistinct?: boolean;
  /** Index method: `btree`, `hash`, `gist`, `gin`, `brin`, ... */
  using?: string;
  /** Default operator class for all fields. */
  operator?: string;
  /** Partial index predicate. */
  where?: unknown;
  /** `CREATE INDEX CONCURRENTLY`. */
  concurrently?: boolean;
  /** Covering index columns (`INCLUDE (...)`). */
  include?: readonly string[];
  /** `IF NOT EXISTS`. */
  ifNotExists?: boolean;
}>;

/** Options of `addConstraint` (Sequelize v6). */
export type ConstraintOptions = Readonly<{
  /** Constraint kind. */
  type:
    | 'check'
    | 'unique'
    | 'primary key'
    | 'foreign key'
    | 'CHECK'
    | 'UNIQUE'
    | 'PRIMARY KEY'
    | 'FOREIGN KEY';
  /** Constrained columns. */
  fields: readonly string[];
  /** Constraint name. */
  name?: string;
  /** Check condition (where object). */
  where?: unknown;
  /** Foreign key target. */
  references?: Readonly<{
    /** Referenced table. */ table: TableName;
    /** Referenced column. */ field: string;
  }>;
  /** `ON DELETE` action. */
  onDelete?: string;
  /** `ON UPDATE` action. */
  onUpdate?: string;
  /** Deferrable mode. */
  deferrable?: DeferrableValue;
  /** `NULLS NOT DISTINCT` for unique constraints. PostgreSQL extension. */
  nullsNotDistinct?: boolean;
}>;

/** Options of a column inside `CREATE TABLE` / `ADD COLUMN`. */
export type ColumnSqlOptions = Readonly<{ inlinePrimaryKey?: boolean; defaultSchema?: string }>;

/** Options of `CREATE TABLE`. */
export type CreateTableOptions = Readonly<{
  comment?: string;
  defaultSchema?: string;
  ifNotExists?: boolean;
}>;
