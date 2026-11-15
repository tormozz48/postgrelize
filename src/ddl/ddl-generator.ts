import inflection from 'inflection';
import type { DataType } from '../data-types/data-types.ts';
import { DefaultValueGenerator } from '../data-types/default-value-generator.ts';
import { SqlExpression } from '../expressions/methods.ts';
import type { AttributeDefinition } from '../model/definition.ts';
import { SqlCompiler } from '../sql/compile.ts';
import { WhereCompiler } from '../where/where.ts';
import { SqlLiteral, type TableName } from './sql-literal.ts';

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

const noContext = new WhereCompiler({ resolve: () => undefined });

const identity = new WhereCompiler({ resolve: (field) => ({ field }) });

const sqlLiteral = new SqlLiteral();

const ACTIONS: ReadonlySet<string> = new Set([
  'CASCADE',
  'SET NULL',
  'SET DEFAULT',
  'RESTRICT',
  'NO ACTION',
]);

const IDENTIFIER_PATTERN = /^[A-Za-z_][\w]*$/;

type NamedUniqueKey = Readonly<{ fields: readonly string[]; nullsNotDistinct: boolean }>;

/**
 * Generates DDL statements (tables, columns, enum types, indexes, constraints, comments,
 * references) for PostgreSQL. Values are inlined as escaped literals.
 *
 * @internal
 */
export class DdlGenerator {
  /**
   * Converts a normalized attribute to a column definition.
   *
   * @param attribute - Normalized attribute.
   * @returns Column definition.
   */
  columnOf(attribute: AttributeDefinition): ColumnDefinition {
    return {
      name: attribute.fieldName,
      field: attribute.field,
      type: attribute.type,
      allowNull: attribute.allowNull,
      primaryKey: attribute.primaryKey === true,
      autoIncrement: attribute.autoIncrement === true,
      defaultValue: attribute.defaultValue,
      unique: attribute.unique,
      comment: attribute.comment,
      references: attribute.references,
      onDelete: attribute.onDelete,
      onUpdate: attribute.onUpdate,
      identity: attribute.identity,
      generated: attribute.generated,
    };
  }

  /**
   * Name of the PostgreSQL enum type of a column (`enum_<table>_<column>`, v6).
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param field - Column name.
   * @returns Unquoted enum type name.
   */
  enumTypeName(table: TableName, field: string): string {
    return `enum_${sqlLiteral.tableParts(table).name}_${field}`;
  }

  /**
   * SQL type of a column (SERIAL for auto-increment integers, enum type names).
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param column - Column definition.
   * @returns SQL type.
   */
  columnType(table: TableName, column: ColumnDefinition): string {
    if (column.identity !== undefined) {
      return `${column.type.sqlType} GENERATED ${column.identity === 'always' ? 'ALWAYS' : 'BY DEFAULT'} AS IDENTITY`;
    }
    if (column.autoIncrement) {
      return column.type.key === 'BIGINT'
        ? 'BIGSERIAL'
        : column.type.key === 'SMALLINT'
          ? 'SMALLSERIAL'
          : 'SERIAL';
    }
    if (column.type.key === 'ENUM') {
      return this.#enumType(table, column.field);
    }
    if (column.type.key === 'ARRAY' && column.type.subtype?.key === 'ENUM') {
      return `${this.#enumType(table, column.field)}[]`;
    }
    return column.type.sqlType;
  }

  /**
   * `DEFAULT ...` clause value.
   *
   * @param column - Column definition.
   * @returns SQL of the default, or `undefined` for client-side defaults.
   */
  defaultSql(column: ColumnDefinition): string | undefined {
    const value = column.defaultValue;
    if (value === undefined || column.autoIncrement || column.generated !== undefined) {
      return undefined;
    }
    if (value instanceof DefaultValueGenerator) {
      return value.key === 'NOW' ? 'now()' : undefined;
    }
    if (value instanceof SqlExpression) {
      return sqlLiteral.inlineExpr(noContext.toExpr(value));
    }
    return column.type.isJson === true
      ? sqlLiteral.escape(JSON.stringify(value))
      : sqlLiteral.escape(value);
  }

  /**
   * `REFERENCES ...` clause.
   *
   * @param column - Column definition.
   * @param defaultSchema - Schema of the referenced table when it has none.
   * @returns SQL of the clause, or `undefined` without references.
   */
  referencesSql(column: ColumnDefinition, defaultSchema?: string): string | undefined {
    const references = column.references;
    if (references === undefined) {
      return undefined;
    }
    const key = typeof references === 'string' ? 'id' : (references.key ?? 'id');
    const deferrable =
      typeof references === 'object'
        ? (references as { deferrable?: DeferrableValue }).deferrable
        : undefined;
    return [
      `REFERENCES ${sqlLiteral.quoteTable(this.#referencedTable(references), defaultSchema)} (${SqlCompiler.quoteIdent(key)})`,
      column.onDelete === undefined ? '' : ` ON DELETE ${this.#validAction(column.onDelete)}`,
      column.onUpdate === undefined ? '' : ` ON UPDATE ${this.#validAction(column.onUpdate)}`,
      deferrable === undefined ? '' : ` ${deferrable.sql}`,
    ].join('');
  }

  /**
   * One column of `CREATE TABLE` / `ADD COLUMN`.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param column - Column definition.
   * @param options - `inlinePrimaryKey` and the default schema of references.
   * @returns Column SQL.
   */
  columnSql(
    table: TableName,
    column: ColumnDefinition,
    options: Readonly<{ inlinePrimaryKey?: boolean; defaultSchema?: string }> = {},
  ): string {
    return [
      `${SqlCompiler.quoteIdent(column.field)} ${this.columnType(table, column)}`,
      column.allowNull || column.primaryKey ? '' : ' NOT NULL',
      options.inlinePrimaryKey === true && column.primaryKey ? ' PRIMARY KEY' : '',
      column.generated === undefined
        ? ''
        : ` GENERATED ALWAYS AS (${sqlLiteral.inlineExpr(noContext.toExpr(column.generated.as))}) ${column.generated.stored === false ? 'VIRTUAL' : 'STORED'}`,
      this.#isUnnamedUnique(column.unique)
        ? this.#nullsNotDistinct(column.unique)
          ? ' UNIQUE NULLS NOT DISTINCT'
          : ' UNIQUE'
        : '',
      ((): string => {
        const value = this.defaultSql(column);
        return value === undefined ? '' : ` DEFAULT ${value}`;
      })(),
      ((): string => {
        const references = this.referencesSql(column, options.defaultSchema);
        return references === undefined ? '' : ` ${references}`;
      })(),
    ].join('');
  }

  /**
   * `CREATE TYPE ... AS ENUM` wrapped so an existing type is not an error (v6).
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param column - Column definition.
   * @returns Statement, or `undefined` for non-enum columns.
   */
  createEnumSql(table: TableName, column: ColumnDefinition): string | undefined {
    const values = this.#enumValues(column);
    if (values === undefined) {
      return undefined;
    }
    const body = `CREATE TYPE ${this.#enumType(table, column.field)} AS ENUM(${values.map((value) => sqlLiteral.escape(value)).join(', ')}); EXCEPTION WHEN duplicate_object THEN null;`;
    return `DO ${sqlLiteral.escape(`BEGIN ${body} END`)}`;
  }

  /**
   * Statements creating a table: enum types, `CREATE TABLE IF NOT EXISTS`, comments.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param columns - Column definitions.
   * @param options - Table comment, default schema and `ifNotExists` (default true).
   * @returns Statements in execution order.
   */
  createTableSql(
    table: TableName,
    columns: readonly ColumnDefinition[],
    options: Readonly<{ comment?: string; defaultSchema?: string; ifNotExists?: boolean }> = {},
  ): readonly string[] {
    const primaryKeys = columns
      .filter((column) => column.primaryKey)
      .map((column) => SqlCompiler.quoteIdent(column.field));
    const uniqueKeys = [...this.#namedUniqueKeys(columns)].map(
      ([name, key]) =>
        `CONSTRAINT ${SqlCompiler.quoteIdent(name)} UNIQUE${key.nullsNotDistinct ? ' NULLS NOT DISTINCT' : ''} (${key.fields.map(SqlCompiler.quoteIdent).join(', ')})`,
    );
    const body = [
      ...columns.map((column) =>
        this.columnSql(
          table,
          column,
          options.defaultSchema === undefined ? {} : { defaultSchema: options.defaultSchema },
        ),
      ),
      ...uniqueKeys,
      ...(primaryKeys.length === 0 ? [] : [`PRIMARY KEY (${primaryKeys.join(', ')})`]),
    ].join(', ');
    const qualified = sqlLiteral.quoteTable(table, options.defaultSchema);
    return [
      ...columns
        .map((column) => this.createEnumSql(table, column))
        .filter((sql): sql is string => sql !== undefined),
      `CREATE TABLE ${options.ifNotExists === false ? '' : 'IF NOT EXISTS '}${qualified} (${body})`,
      ...(options.comment === undefined
        ? []
        : [`COMMENT ON TABLE ${qualified} IS ${sqlLiteral.escape(options.comment)}`]),
      ...columns.flatMap((column) => this.columnCommentSql(table, column)),
    ];
  }

  /**
   * `COMMENT ON COLUMN` for a column with a comment.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param column - Column name and comment.
   * @returns The statement, or nothing without a comment.
   */
  columnCommentSql(
    table: TableName,
    column: Readonly<{ field: string; comment?: string }>,
  ): readonly string[] {
    return column.comment === undefined
      ? []
      : [
          `COMMENT ON COLUMN ${sqlLiteral.quoteTable(table)}.${SqlCompiler.quoteIdent(column.field)} IS ${sqlLiteral.escape(column.comment)}`,
        ];
  }

  /**
   * `ALTER TYPE ... ADD VALUE IF NOT EXISTS` for every enum value of a column.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param column - Column definition.
   * @returns Statements; empty for non-enum columns.
   */
  addEnumValuesSql(table: TableName, column: ColumnDefinition): readonly string[] {
    return (this.#enumValues(column) ?? []).map(
      (value) =>
        `ALTER TYPE ${this.#enumType(table, column.field)} ADD VALUE IF NOT EXISTS ${sqlLiteral.escape(value)}`,
    );
  }

  /**
   * `ALTER TABLE ... ALTER COLUMN` statements bringing a column to its definition (v6 changeColumn).
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param column - Column definition.
   * @param defaultSchema - Schema used when the table reference has none.
   * @returns Statements in execution order.
   */
  changeColumnSql(
    table: TableName,
    column: ColumnDefinition,
    defaultSchema?: string,
  ): readonly string[] {
    const qualified = sqlLiteral.quoteTable(table, defaultSchema);
    const target = `ALTER TABLE ${qualified} ALTER COLUMN ${SqlCompiler.quoteIdent(column.field)}`;
    const value = this.defaultSql(column);
    const enumSql = this.createEnumSql(table, column);
    const type = this.columnType(table, { ...column, autoIncrement: false });
    return [
      `${target} ${column.allowNull ? 'DROP NOT NULL' : 'SET NOT NULL'}`,
      ...(column.autoIncrement === true && value === undefined
        ? []
        : [value === undefined ? `${target} DROP DEFAULT` : `${target} SET DEFAULT ${value}`]),
      ...(enumSql === undefined ? [] : [enumSql]),
      `${target} TYPE ${type}${column.type.key === 'ENUM' ? ` USING (${SqlCompiler.quoteIdent(column.field)}::${type})` : ''}`,
      ...this.columnCommentSql(table, column),
    ];
  }

  /**
   * Default index name (v6 `Utils.nameIndex`).
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param fields - Indexed fields.
   * @returns Index name.
   */
  indexName(table: TableName, fields: readonly IndexField[]): string {
    return inflection
      .underscore(
        `${sqlLiteral.tableParts(table).name}_${fields.map((field) => this.#fieldName(field)).join('_')}`,
      )
      .replaceAll('.', '_');
  }

  /**
   * `CREATE [UNIQUE] INDEX` statement.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param options - Index options.
   * @param defaultSchema - Schema used when the table reference has none.
   * @returns Statement.
   * @throws Error without fields or with an invalid method / operator class.
   */
  createIndexSql(table: TableName, options: IndexOptions, defaultSchema?: string): string {
    const fields = options.fields ?? [];
    if (fields.length === 0) {
      throw new Error('Index requires at least one field');
    }
    const columns = fields
      .map((field) =>
        typeof field === 'string'
          ? `${SqlCompiler.quoteIdent(field)}${options.operator === undefined ? '' : ` ${this.#safeWord(options.operator, 'operator class')}`}`
          : [
              SqlCompiler.quoteIdent(field.name),
              field.collate === undefined
                ? ''
                : ` COLLATE ${SqlCompiler.quoteIdent(field.collate)}`,
              (field.operator ?? options.operator) === undefined
                ? ''
                : ` ${this.#safeWord(field.operator ?? options.operator ?? '', 'operator class')}`,
              field.order === undefined ? '' : ` ${field.order === 'DESC' ? 'DESC' : 'ASC'}`,
            ].join(''),
      )
      .join(', ');
    const where =
      options.where === undefined
        ? ''
        : ` WHERE ${sqlLiteral.inlineExpr(identity.compile(options.where))}`;
    return [
      `CREATE ${options.unique === true ? 'UNIQUE ' : ''}INDEX ${options.concurrently === true ? 'CONCURRENTLY ' : ''}${options.ifNotExists === true ? 'IF NOT EXISTS ' : ''}`,
      `${SqlCompiler.quoteIdent(options.name ?? this.indexName(table, fields))} ON ${sqlLiteral.quoteTable(table, defaultSchema)}`,
      options.using === undefined ? '' : ` USING ${this.#safeWord(options.using, 'index method')}`,
      ` (${columns})`,
      options.include === undefined || options.include.length === 0
        ? ''
        : ` INCLUDE (${options.include.map(SqlCompiler.quoteIdent).join(', ')})`,
      options.unique === true && options.nullsNotDistinct === true ? ' NULLS NOT DISTINCT' : '',
      where,
    ].join('');
  }

  /**
   * `ALTER TABLE ... ADD CONSTRAINT` statement.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param options - Constraint definition.
   * @param defaultSchema - Schema used when a table reference has none.
   * @returns Statement.
   * @throws Error for an unknown constraint type or a foreign key without references.
   */
  addConstraintSql(table: TableName, options: ConstraintOptions, defaultSchema?: string): string {
    const type = options.type.toLowerCase();
    const name =
      options.name ??
      `${sqlLiteral.tableParts(table).name}_${options.fields.join('_')}_${type.replace(' ', '_').replace('primary_key', 'pk').replace('foreign_key', 'fkey').replace('check', 'ck').replace('unique', 'uk')}`;
    const fields = options.fields.map(SqlCompiler.quoteIdent).join(', ');
    const body = ((): string => {
      switch (type) {
        case 'check':
          return `CHECK (${sqlLiteral.inlineExpr(identity.compile(options.where))})`;
        case 'unique':
          return `UNIQUE${options.nullsNotDistinct === true ? ' NULLS NOT DISTINCT' : ''} (${fields})`;
        case 'primary key':
          return `PRIMARY KEY (${fields})`;
        case 'foreign key': {
          if (options.references === undefined) {
            throw new Error('Foreign key constraint requires references');
          }
          return [
            `FOREIGN KEY (${fields}) REFERENCES ${sqlLiteral.quoteTable(options.references.table, defaultSchema)} (${SqlCompiler.quoteIdent(options.references.field)})`,
            options.onDelete === undefined
              ? ''
              : ` ON DELETE ${this.#validAction(options.onDelete)}`,
            options.onUpdate === undefined
              ? ''
              : ` ON UPDATE ${this.#validAction(options.onUpdate)}`,
            options.deferrable === undefined ? '' : ` ${options.deferrable.sql}`,
          ].join('');
        }
        default:
          throw new Error(
            `Constraint type must be specified through options.type: ${options.type}`,
          );
      }
    })();
    return `ALTER TABLE ${sqlLiteral.quoteTable(table, defaultSchema)} ADD CONSTRAINT ${SqlCompiler.quoteIdent(name)} ${body}`;
  }

  #enumType(table: TableName, field: string): string {
    const { schema } = sqlLiteral.tableParts(table);
    const name = SqlCompiler.quoteIdent(this.enumTypeName(table, field));
    return schema === undefined ? name : `${SqlCompiler.quoteIdent(schema)}.${name}`;
  }

  #enumValues(column: ColumnDefinition): readonly string[] | undefined {
    return column.type.key === 'ENUM'
      ? column.type.values
      : column.type.subtype?.key === 'ENUM'
        ? column.type.subtype.values
        : undefined;
  }

  #isUnnamedUnique(unique: ColumnDefinition['unique']): boolean {
    return (
      unique === true ||
      (typeof unique === 'object' && unique !== null && unique.name === undefined)
    );
  }

  #nullsNotDistinct(unique: ColumnDefinition['unique']): boolean {
    return (
      typeof unique === 'object' &&
      unique !== null &&
      (unique as { nullsNotDistinct?: boolean }).nullsNotDistinct === true
    );
  }

  #referencedTable(references: NonNullable<ColumnDefinition['references']>): TableName {
    return typeof references === 'string'
      ? references
      : typeof references.model === 'string'
        ? references.model
        : (references.model as Readonly<{ tableName: string; schema?: string }>);
  }

  #validAction(action: string): string {
    const normalized = action.trim().toUpperCase();
    if (!ACTIONS.has(normalized)) {
      throw new Error(`Invalid referential action: ${action}`);
    }
    return normalized;
  }

  /** Named unique keys: name → fields, with the NULLS NOT DISTINCT flag. */
  #namedUniqueKeys(columns: readonly ColumnDefinition[]): ReadonlyMap<string, NamedUniqueKey> {
    return columns.reduce((keys, column) => {
      const unique = column.unique;
      const name =
        typeof unique === 'string'
          ? unique
          : typeof unique === 'object' && unique !== null
            ? unique.name
            : undefined;
      if (name === undefined) {
        return keys;
      }
      const existing = keys.get(name);
      return new Map([
        ...keys,
        [
          name,
          {
            fields: [...(existing?.fields ?? []), column.field],
            nullsNotDistinct:
              (existing?.nullsNotDistinct ?? false) || this.#nullsNotDistinct(unique),
          },
        ],
      ]);
    }, new Map<string, NamedUniqueKey>());
  }

  #safeWord(value: string, kind: string): string {
    if (!IDENTIFIER_PATTERN.test(value)) {
      throw new Error(`Invalid ${kind}: ${value}`);
    }
    return value;
  }

  #fieldName(field: IndexField): string {
    return typeof field === 'string' ? field : field.name;
  }
}
