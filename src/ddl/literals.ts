import { SqlCompiler, type CompiledQuery } from '../sql/compile.ts';
import type { ExprNode } from '../sql/ast.ts';

/**
 * Renders a value as a PostgreSQL literal for DDL, where bind parameters are not allowed
 * (ADR-010). Strings with backslashes use the `E'...'` form.
 */
export const escapeLiteral = (value: unknown): string => {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Cannot render non-finite number ${String(value)} as SQL literal`);
    }
    return String(value);
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (value instanceof Date) {
    return escapeString(value.toISOString());
  }
  if (Buffer.isBuffer(value)) {
    return `'\\x${value.toString('hex')}'::bytea`;
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? "'{}'" : `ARRAY[${value.map(escapeLiteral).join(', ')}]`;
  }
  if (typeof value === 'object') {
    return escapeString(JSON.stringify(value));
  }
  return escapeString(String(value));
};

const compiler = new SqlCompiler();

const escapeString = (text: string): string => {
  if (text.includes('\0')) {
    throw new Error('SQL literals cannot contain NUL characters');
  }
  const quoted = text.replaceAll("'", "''");
  return text.includes('\\') ? `E'${quoted.replaceAll('\\', '\\\\')}'` : `'${quoted}'`;
};

const PLACEHOLDER = /'(?:[^']|'')*'|"(?:[^"]|"")*"|\$(\d+)/g;

/** Replaces `$n` placeholders of a compiled query with escaped literals. */
export const inlineValues = (query: CompiledQuery): string =>
  query.text.replace(PLACEHOLDER, (token, index?: string) =>
    index === undefined ? token : escapeLiteral(query.values[Number(index) - 1]),
  );

/** Compiles an expression node and inlines its values (for DDL). */
export const inlineExpr = (node: ExprNode): string => inlineValues(compiler.compileExpr(node));

/** Table reference accepted by QueryInterface: a name or `{ tableName, schema }`. */
export type TableName = string | QualifiedTable;

/** Schema-qualified table reference. */
export type QualifiedTable = Readonly<{
  /** Table name. */
  tableName: string;
  /** Schema name. */
  schema?: string;
}>;

/** Splits a table reference into name and schema. */
export const tableParts = (
  table: TableName,
  defaultSchema?: string,
): Readonly<{ name: string; schema: string | undefined }> =>
  typeof table === 'string'
    ? { name: table, schema: defaultSchema }
    : { name: table.tableName, schema: table.schema ?? defaultSchema };

/** Quoted, schema-qualified table name. */
export const quoteTable = (table: TableName, defaultSchema?: string): string => {
  const { name, schema } = tableParts(table, defaultSchema);
  return schema === undefined
    ? SqlCompiler.quoteIdent(name)
    : `${SqlCompiler.quoteIdent(schema)}.${SqlCompiler.quoteIdent(name)}`;
};
