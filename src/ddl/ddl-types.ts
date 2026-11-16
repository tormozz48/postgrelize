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
 * await queryInterface.addColumn('posts', 'userId', {
 *   type: DataTypes.INTEGER,
 *   references: { model: 'Users', key: 'id', deferrable: Deferrable.INITIALLY_DEFERRED },
 * });
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

/** Modifiers shared by every index element. */
type IndexElementModifiers = Readonly<{
  /** `ASC` / `DESC`. */
  order?: 'ASC' | 'DESC';
  /** `NULLS FIRST` / `NULLS LAST`. PostgreSQL extension. */
  nulls?: 'FIRST' | 'LAST';
  /** Collation name (quoted identifier). */
  collate?: string;
  /** Operator class, e.g. `'jsonb_path_ops'`. */
  operator?: string;
}>;

/**
 * Index field: a column name, `{ name, order, nulls, collate, operator }` or an expression
 * `{ expression, ... }`. The `expression` is trusted SQL (not escaped): never build it from user
 * input. An index with an expression field needs an explicit `name`.
 */
export type IndexField =
  | string
  | (IndexElementModifiers &
      Readonly<{
        /** Column name. */
        name: string;
        /** Not used for a column field. */
        expression?: undefined;
      }>)
  | (IndexElementModifiers &
      Readonly<{
        /** Trusted SQL expression, wrapped in parentheses. */
        expression: string;
        /** Not used for an expression field. */
        name?: undefined;
      }>);

/**
 * Options of `addIndex` and model `indexes` (Sequelize v6 `IndexesOptions`).
 *
 * @example
 * ```ts
 * const options: IndexOptions = {
 *   fields: ['email'],
 *   unique: true,
 *   where: { active: true },
 *   using: 'btree',
 * };
 * await queryInterface.addIndex('users', options);
 * ```
 */
export type IndexOptions = Readonly<{
  /** Indexed columns. */
  fields?: readonly IndexField[];
  /** Index name; default `underscore(<table>_<fields>)`. Required when a field is an expression. */
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

/**
 * Options of `addConstraint` (Sequelize v6).
 *
 * @example
 * ```ts
 * const options: ConstraintOptions = {
 *   type: 'foreign key',
 *   fields: ['userId'],
 *   name: 'posts_user_fk',
 *   references: { table: 'users', field: 'id' },
 *   onDelete: 'CASCADE',
 * };
 * await queryInterface.addConstraint('posts', options);
 * ```
 */
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
  unlogged?: boolean;
  temporary?: boolean;
  defaultSchema?: string;
  ifNotExists?: boolean;
}>;
