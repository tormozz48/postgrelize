import { SqlCompiler } from '../sql/compile.ts';
import { SqlLiteral } from './sql-literal.ts';

const sqlLiteral = new SqlLiteral();

/**
 * Options of `createExtension`.
 *
 * @example
 * ```ts
 * const options: CreateExtensionOptions = { ifNotExists: true, schema: 'public' };
 * await queryInterface.createExtension('pg_trgm', options);
 * ```
 */
export type CreateExtensionOptions = Readonly<{
  /** Adds `IF NOT EXISTS`. */
  ifNotExists?: boolean;
  /** Schema that receives the extension objects. */
  schema?: string;
  /** Extension version to install. */
  version?: string;
  /** Also installs the extensions it depends on. */
  cascade?: boolean;
}>;

/**
 * Options of `dropExtension`.
 *
 * @example
 * ```ts
 * const options: DropExtensionOptions = { ifExists: true, cascade: true };
 * await queryInterface.dropExtension('pg_trgm', options);
 * ```
 */
export type DropExtensionOptions = Readonly<{
  /** Adds `IF EXISTS`. */
  ifExists?: boolean;
  /** Also drops objects that depend on the extension. */
  cascade?: boolean;
}>;

/**
 * `CREATE EXTENSION` and `DROP EXTENSION` statements.
 *
 * @internal
 */
export class ExtensionDdl {
  /**
   * `CREATE EXTENSION` statement.
   *
   * @param name - Extension name.
   * @param options - Statement options.
   * @returns Statement.
   */
  createSql(name: string, options: CreateExtensionOptions): string {
    return [
      `CREATE EXTENSION ${options.ifNotExists === true ? 'IF NOT EXISTS ' : ''}${SqlCompiler.quoteIdent(name)}`,
      options.schema === undefined ? '' : ` SCHEMA ${SqlCompiler.quoteIdent(options.schema)}`,
      options.version === undefined ? '' : ` VERSION ${sqlLiteral.escape(options.version)}`,
      options.cascade === true ? ' CASCADE' : '',
    ].join('');
  }

  /**
   * `DROP EXTENSION` statement.
   *
   * @param name - Extension name.
   * @param options - Statement options.
   * @returns Statement.
   */
  dropSql(name: string, options: DropExtensionOptions): string {
    return `DROP EXTENSION ${options.ifExists === true ? 'IF EXISTS ' : ''}${SqlCompiler.quoteIdent(name)}${options.cascade === true ? ' CASCADE' : ''}`;
  }
}
