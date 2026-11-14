import inflection from 'inflection';
import { isDefaultValueGenerator, type DataType } from '../data-types/data-types.ts';
import { isExpression } from '../expressions/methods.ts';
import type { AttributeDefinition } from '../model/definition.ts';
import { quoteIdent } from '../sql/compile.ts';
import { toExpr, whereToAst, type WhereContext } from '../where/where.ts';
import { escapeLiteral, inlineExpr, quoteTable, tableParts, type TableName } from './literals.ts';

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

const noContext: WhereContext = { resolve: () => undefined };

/** Converts a normalized attribute to a column definition. */
export const columnOf = (attribute: AttributeDefinition): ColumnDefinition => ({
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
});

/** Name of the PostgreSQL enum type of a column (`enum_<table>_<column>`, v6). */
export const enumTypeName = (table: TableName, field: string): string =>
  `enum_${tableParts(table).name}_${field}`;

const enumType = (table: TableName, field: string): string => {
  const { schema } = tableParts(table);
  const name = quoteIdent(enumTypeName(table, field));
  return schema === undefined ? name : `${quoteIdent(schema)}.${name}`;
};

/** SQL type of a column (SERIAL for auto-increment integers, enum type names). */
export const columnType = (table: TableName, column: ColumnDefinition): string => {
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
    return enumType(table, column.field);
  }
  if (column.type.key === 'ARRAY' && column.type.subtype?.key === 'ENUM') {
    return `${enumType(table, column.field)}[]`;
  }
  return column.type.sqlType;
};

/** `DEFAULT ...` clause value, or `undefined` for client-side defaults. */
export const defaultSql = (column: ColumnDefinition): string | undefined => {
  const value = column.defaultValue;
  if (value === undefined || column.autoIncrement || column.generated !== undefined) {
    return undefined;
  }
  if (isDefaultValueGenerator(value)) {
    return value.key === 'NOW' ? 'now()' : undefined;
  }
  if (isExpression(value)) {
    return inlineExpr(toExpr(value, noContext));
  }
  return column.type.isJson === true ? escapeLiteral(JSON.stringify(value)) : escapeLiteral(value);
};

const isUnnamedUnique = (unique: ColumnDefinition['unique']): boolean =>
  unique === true || (typeof unique === 'object' && unique !== null && unique.name === undefined);

const nullsNotDistinct = (unique: ColumnDefinition['unique']): boolean =>
  typeof unique === 'object' &&
  unique !== null &&
  (unique as { nullsNotDistinct?: boolean }).nullsNotDistinct === true;

const referencedTable = (references: NonNullable<ColumnDefinition['references']>): TableName =>
  typeof references === 'string'
    ? references
    : typeof references.model === 'string'
      ? references.model
      : (references.model as Readonly<{ tableName: string; schema?: string }>);

/** `REFERENCES ...` clause. */
export const referencesSql = (
  column: ColumnDefinition,
  defaultSchema?: string,
): string | undefined => {
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
    `REFERENCES ${quoteTable(referencedTable(references), defaultSchema)} (${quoteIdent(key)})`,
    column.onDelete === undefined ? '' : ` ON DELETE ${validAction(column.onDelete)}`,
    column.onUpdate === undefined ? '' : ` ON UPDATE ${validAction(column.onUpdate)}`,
    deferrable === undefined ? '' : ` ${deferrable.sql}`,
  ].join('');
};

const ACTIONS: ReadonlySet<string> = new Set([
  'CASCADE',
  'SET NULL',
  'SET DEFAULT',
  'RESTRICT',
  'NO ACTION',
]);

const validAction = (action: string): string => {
  const normalized = action.trim().toUpperCase();
  if (!ACTIONS.has(normalized)) {
    throw new Error(`Invalid referential action: ${action}`);
  }
  return normalized;
};

/** One column of `CREATE TABLE` / `ADD COLUMN`. */
export const columnSql = (
  table: TableName,
  column: ColumnDefinition,
  options: Readonly<{ inlinePrimaryKey?: boolean; defaultSchema?: string }> = {},
): string =>
  [
    `${quoteIdent(column.field)} ${columnType(table, column)}`,
    column.allowNull || column.primaryKey ? '' : ' NOT NULL',
    options.inlinePrimaryKey === true && column.primaryKey ? ' PRIMARY KEY' : '',
    column.generated === undefined
      ? ''
      : ` GENERATED ALWAYS AS (${inlineExpr(toExpr(column.generated.as, noContext))}) ${column.generated.stored === false ? 'VIRTUAL' : 'STORED'}`,
    isUnnamedUnique(column.unique)
      ? nullsNotDistinct(column.unique)
        ? ' UNIQUE NULLS NOT DISTINCT'
        : ' UNIQUE'
      : '',
    ((): string => {
      const value = defaultSql(column);
      return value === undefined ? '' : ` DEFAULT ${value}`;
    })(),
    ((): string => {
      const references = referencesSql(column, options.defaultSchema);
      return references === undefined ? '' : ` ${references}`;
    })(),
  ].join('');

/** `CREATE TYPE ... AS ENUM` wrapped so an existing type is not an error (v6). */
export const createEnumSql = (table: TableName, column: ColumnDefinition): string | undefined => {
  const values =
    column.type.key === 'ENUM'
      ? column.type.values
      : column.type.subtype?.key === 'ENUM'
        ? column.type.subtype.values
        : undefined;
  if (values === undefined) {
    return undefined;
  }
  const body = `CREATE TYPE ${enumType(table, column.field)} AS ENUM(${values.map(escapeLiteral).join(', ')}); EXCEPTION WHEN duplicate_object THEN null;`;
  return `DO ${escapeLiteral(`BEGIN ${body} END`)}`;
};

/** Named unique keys: name → fields, with the NULLS NOT DISTINCT flag. */
const namedUniqueKeys = (
  columns: readonly ColumnDefinition[],
): ReadonlyMap<string, Readonly<{ fields: readonly string[]; nullsNotDistinct: boolean }>> =>
  columns.reduce((keys, column) => {
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
          nullsNotDistinct: (existing?.nullsNotDistinct ?? false) || nullsNotDistinct(unique),
        },
      ],
    ]);
  }, new Map<string, Readonly<{ fields: readonly string[]; nullsNotDistinct: boolean }>>());

/** Statements creating a table: enum types, `CREATE TABLE IF NOT EXISTS`, column comments. */
export const createTableSql = (
  table: TableName,
  columns: readonly ColumnDefinition[],
  options: Readonly<{ comment?: string; defaultSchema?: string; ifNotExists?: boolean }> = {},
): readonly string[] => {
  const primaryKeys = columns
    .filter((column) => column.primaryKey)
    .map((column) => quoteIdent(column.field));
  const uniqueKeys = [...namedUniqueKeys(columns)].map(
    ([name, key]) =>
      `CONSTRAINT ${quoteIdent(name)} UNIQUE${key.nullsNotDistinct ? ' NULLS NOT DISTINCT' : ''} (${key.fields.map(quoteIdent).join(', ')})`,
  );
  const body = [
    ...columns.map((column) =>
      columnSql(
        table,
        column,
        options.defaultSchema === undefined ? {} : { defaultSchema: options.defaultSchema },
      ),
    ),
    ...uniqueKeys,
    ...(primaryKeys.length === 0 ? [] : [`PRIMARY KEY (${primaryKeys.join(', ')})`]),
  ].join(', ');
  const qualified = quoteTable(table, options.defaultSchema);
  return [
    ...columns
      .map((column) => createEnumSql(table, column))
      .filter((sql): sql is string => sql !== undefined),
    `CREATE TABLE ${options.ifNotExists === false ? '' : 'IF NOT EXISTS '}${qualified} (${body})`,
    ...(options.comment === undefined
      ? []
      : [`COMMENT ON TABLE ${qualified} IS ${escapeLiteral(options.comment)}`]),
    ...columns.flatMap((column) => columnCommentSql(table, column)),
  ];
};

/** `COMMENT ON COLUMN` for a column with a comment (empty otherwise). */
export const columnCommentSql = (
  table: TableName,
  column: Readonly<{ field: string; comment?: string }>,
): readonly string[] =>
  column.comment === undefined
    ? []
    : [
        `COMMENT ON COLUMN ${quoteTable(table)}.${quoteIdent(column.field)} IS ${escapeLiteral(column.comment)}`,
      ];

/** `ALTER TYPE ... ADD VALUE IF NOT EXISTS` for every enum value of a column. */
export const addEnumValuesSql = (table: TableName, column: ColumnDefinition): readonly string[] => {
  const values =
    column.type.key === 'ENUM'
      ? column.type.values
      : column.type.subtype?.key === 'ENUM'
        ? column.type.subtype.values
        : undefined;
  return (values ?? []).map(
    (value) =>
      `ALTER TYPE ${enumType(table, column.field)} ADD VALUE IF NOT EXISTS ${escapeLiteral(value)}`,
  );
};

/** `ALTER TABLE ... ALTER COLUMN` statements bringing a column to its definition (v6 changeColumn). */
export const changeColumnSql = (
  table: TableName,
  column: ColumnDefinition,
  defaultSchema?: string,
): readonly string[] => {
  const qualified = quoteTable(table, defaultSchema);
  const target = `ALTER TABLE ${qualified} ALTER COLUMN ${quoteIdent(column.field)}`;
  const value = defaultSql(column);
  const enumSql = createEnumSql(table, column);
  const type = columnType(table, { ...column, autoIncrement: false });
  return [
    `${target} ${column.allowNull ? 'DROP NOT NULL' : 'SET NOT NULL'}`,
    ...(column.autoIncrement === true && value === undefined
      ? []
      : [value === undefined ? `${target} DROP DEFAULT` : `${target} SET DEFAULT ${value}`]),
    ...(enumSql === undefined ? [] : [enumSql]),
    `${target} TYPE ${type}${column.type.key === 'ENUM' ? ` USING (${quoteIdent(column.field)}::${type})` : ''}`,
    ...columnCommentSql(table, column),
  ];
};

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

const IDENTIFIER_PATTERN = /^[A-Za-z_][\w]*$/;

const safeWord = (value: string, kind: string): string => {
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new Error(`Invalid ${kind}: ${value}`);
  }
  return value;
};

const fieldName = (field: IndexField): string => (typeof field === 'string' ? field : field.name);

/** Default index name (v6 `Utils.nameIndex`). */
export const indexName = (table: TableName, fields: readonly IndexField[]): string =>
  inflection
    .underscore(`${tableParts(table).name}_${fields.map(fieldName).join('_')}`)
    .replaceAll('.', '_');

/** `CREATE [UNIQUE] INDEX` statement. */
export const createIndexSql = (
  table: TableName,
  options: IndexOptions,
  defaultSchema?: string,
): string => {
  const fields = options.fields ?? [];
  if (fields.length === 0) {
    throw new Error('Index requires at least one field');
  }
  const columns = fields
    .map((field) =>
      typeof field === 'string'
        ? `${quoteIdent(field)}${options.operator === undefined ? '' : ` ${safeWord(options.operator, 'operator class')}`}`
        : [
            quoteIdent(field.name),
            field.collate === undefined ? '' : ` COLLATE ${quoteIdent(field.collate)}`,
            (field.operator ?? options.operator) === undefined
              ? ''
              : ` ${safeWord(field.operator ?? options.operator ?? '', 'operator class')}`,
            field.order === undefined ? '' : ` ${field.order === 'DESC' ? 'DESC' : 'ASC'}`,
          ].join(''),
    )
    .join(', ');
  const where =
    options.where === undefined
      ? ''
      : ` WHERE ${inlineExpr(whereToAst(options.where, { resolve: (name) => ({ field: name }) }))}`;
  return [
    `CREATE ${options.unique === true ? 'UNIQUE ' : ''}INDEX ${options.concurrently === true ? 'CONCURRENTLY ' : ''}${options.ifNotExists === true ? 'IF NOT EXISTS ' : ''}`,
    `${quoteIdent(options.name ?? indexName(table, fields))} ON ${quoteTable(table, defaultSchema)}`,
    options.using === undefined ? '' : ` USING ${safeWord(options.using, 'index method')}`,
    ` (${columns})`,
    options.include === undefined || options.include.length === 0
      ? ''
      : ` INCLUDE (${options.include.map(quoteIdent).join(', ')})`,
    options.unique === true && options.nullsNotDistinct === true ? ' NULLS NOT DISTINCT' : '',
    where,
  ].join('');
};

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

/** `ALTER TABLE ... ADD CONSTRAINT` statement. */
export const addConstraintSql = (
  table: TableName,
  options: ConstraintOptions,
  defaultSchema?: string,
): string => {
  const type = options.type.toLowerCase();
  const name =
    options.name ??
    `${tableParts(table).name}_${options.fields.join('_')}_${type.replace(' ', '_').replace('primary_key', 'pk').replace('foreign_key', 'fkey').replace('check', 'ck').replace('unique', 'uk')}`;
  const fields = options.fields.map(quoteIdent).join(', ');
  const body = ((): string => {
    switch (type) {
      case 'check':
        return `CHECK (${inlineExpr(whereToAst(options.where, { resolve: (field) => ({ field }) }))})`;
      case 'unique':
        return `UNIQUE${options.nullsNotDistinct === true ? ' NULLS NOT DISTINCT' : ''} (${fields})`;
      case 'primary key':
        return `PRIMARY KEY (${fields})`;
      case 'foreign key': {
        if (options.references === undefined) {
          throw new Error('Foreign key constraint requires references');
        }
        return [
          `FOREIGN KEY (${fields}) REFERENCES ${quoteTable(options.references.table, defaultSchema)} (${quoteIdent(options.references.field)})`,
          options.onDelete === undefined ? '' : ` ON DELETE ${validAction(options.onDelete)}`,
          options.onUpdate === undefined ? '' : ` ON UPDATE ${validAction(options.onUpdate)}`,
          options.deferrable === undefined ? '' : ` ${options.deferrable.sql}`,
        ].join('');
      }
      default:
        throw new Error(`Constraint type must be specified through options.type: ${options.type}`);
    }
  })();
  return `ALTER TABLE ${quoteTable(table, defaultSchema)} ADD CONSTRAINT ${quoteIdent(name)} ${body}`;
};
