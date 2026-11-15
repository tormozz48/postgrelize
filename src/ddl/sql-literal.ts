import { SqlCompiler, type CompiledQuery } from '../sql/compile.ts';
import type { ExprNode } from '../sql/ast.ts';

/** Table reference accepted by QueryInterface: a name or `{ tableName, schema }`. */
export type TableName = string | QualifiedTable;

/** Schema-qualified table reference. */
export type QualifiedTable = Readonly<{
  /** Table name. */
  tableName: string;
  /** Schema name. */
  schema?: string;
}>;

const compiler = new SqlCompiler();

const PLACEHOLDER = /'(?:[^']|'')*'|"(?:[^"]|"")*"|(?<![\w$])\$(\d+)/g;

/**
 * Renders values as PostgreSQL literals and table references as quoted names, for DDL where bind
 * parameters are not allowed (ADR-010).
 *
 * @internal
 */
export class SqlLiteral {
  /**
   * Renders a value as a PostgreSQL literal. Strings with backslashes use the `E'...'` form.
   *
   * @param value - Value to render.
   * @returns SQL literal.
   * @throws Error for non-finite numbers and strings with NUL characters.
   */
  escape(value: unknown): string {
    if (value === null || value === undefined) {
      return 'NULL';
    }
    switch (typeof value) {
      case 'boolean':
        return value ? 'true' : 'false';
      case 'number':
        return this.#escapeNumber(value);
      case 'bigint':
        return value.toString();
      case 'object':
        return this.#escapeObject(value);
      default:
        return this.#escapeString(String(value));
    }
  }

  /**
   * Replaces `$n` placeholders of a compiled query with escaped literals.
   *
   * @param query - Compiled query.
   * @returns SQL text without placeholders.
   */
  inlineValues(query: CompiledQuery): string {
    return query.text.replace(PLACEHOLDER, (token, index?: string) =>
      index === undefined ? token : this.escape(query.values[Number(index) - 1]),
    );
  }

  /**
   * Compiles an expression node and inlines its values (for DDL).
   *
   * @param node - Expression node.
   * @returns SQL text without placeholders.
   */
  inlineExpr(node: ExprNode): string {
    return this.inlineValues(compiler.compileExpr(node));
  }

  /**
   * Splits a table reference into name and schema.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param defaultSchema - Schema used when the reference has none.
   * @returns Table name and schema.
   */
  tableParts(
    table: TableName,
    defaultSchema?: string,
  ): Readonly<{ name: string; schema: string | undefined }> {
    return typeof table === 'string'
      ? { name: table, schema: defaultSchema }
      : { name: table.tableName, schema: table.schema ?? defaultSchema };
  }

  /**
   * Quoted, schema-qualified table name.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param defaultSchema - Schema used when the reference has none.
   * @returns Quoted table name.
   */
  quoteTable(table: TableName, defaultSchema?: string): string {
    const { name, schema } = this.tableParts(table, defaultSchema);
    return schema === undefined
      ? SqlCompiler.quoteIdent(name)
      : `${SqlCompiler.quoteIdent(schema)}.${SqlCompiler.quoteIdent(name)}`;
  }

  #escapeNumber(value: number): string {
    if (!Number.isFinite(value)) {
      throw new Error(`Cannot render non-finite number ${String(value)} as SQL literal`);
    }
    return String(value);
  }

  #escapeObject(value: object): string {
    if (value instanceof Date) {
      return this.#escapeString(value.toISOString());
    }
    if (Buffer.isBuffer(value)) {
      return `'\\x${value.toString('hex')}'::bytea`;
    }
    if (Array.isArray(value)) {
      return value.length === 0
        ? "'{}'"
        : `ARRAY[${value.map((item: unknown) => this.escape(item)).join(', ')}]`;
    }
    return this.#escapeString(JSON.stringify(value));
  }

  #escapeString(text: string): string {
    if (text.includes('\0')) {
      throw new Error('SQL literals cannot contain NUL characters');
    }
    const quoted = text.replaceAll("'", "''");
    return text.includes('\\') ? `E'${quoted.replaceAll('\\', '\\\\')}'` : `'${quoted}'`;
  }
}
