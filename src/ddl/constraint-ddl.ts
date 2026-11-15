import { SqlCompiler } from '../sql/compile.ts';
import { WhereCompiler } from '../where/where.ts';
import { DdlGuards } from './ddl-guards.ts';
import type { ConstraintOptions } from './ddl-types.ts';
import { SqlLiteral, type TableName } from './sql-literal.ts';

const guards = new DdlGuards();

const identity = new WhereCompiler({ resolve: (field) => ({ field }) });

const sqlLiteral = new SqlLiteral();

/**
 * `ALTER TABLE ... ADD CONSTRAINT` statements (check, unique, primary and foreign keys).
 *
 * @internal
 */
export class ConstraintDdl {
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
    const name = options.name ?? this.#defaultName(table, options.fields, type);
    const fields = options.fields.map(SqlCompiler.quoteIdent).join(', ');
    const body = this.#body(type, fields, options, defaultSchema);
    return `ALTER TABLE ${sqlLiteral.quoteTable(table, defaultSchema)} ADD CONSTRAINT ${SqlCompiler.quoteIdent(name)} ${body}`;
  }

  #defaultName(table: TableName, fields: readonly string[], type: string): string {
    const suffix = type
      .replace(' ', '_')
      .replace('primary_key', 'pk')
      .replace('foreign_key', 'fkey')
      .replace('check', 'ck')
      .replace('unique', 'uk');
    return `${sqlLiteral.tableParts(table).name}_${fields.join('_')}_${suffix}`;
  }

  #body(
    type: string,
    fields: string,
    options: ConstraintOptions,
    defaultSchema: string | undefined,
  ): string {
    switch (type) {
      case 'check':
        return `CHECK (${sqlLiteral.inlineExpr(identity.compile(options.where))})`;
      case 'unique':
        return `UNIQUE${options.nullsNotDistinct === true ? ' NULLS NOT DISTINCT' : ''} (${fields})`;
      case 'primary key':
        return `PRIMARY KEY (${fields})`;
      case 'foreign key':
        return this.#foreignKey(fields, options, defaultSchema);
      default:
        throw new Error(`Constraint type must be specified through options.type: ${options.type}`);
    }
  }

  #foreignKey(
    fields: string,
    options: ConstraintOptions,
    defaultSchema: string | undefined,
  ): string {
    if (options.references === undefined) {
      throw new Error('Foreign key constraint requires references');
    }
    const target = `FOREIGN KEY (${fields}) REFERENCES ${sqlLiteral.quoteTable(options.references.table, defaultSchema)} (${SqlCompiler.quoteIdent(options.references.field)})`;
    return `${target}${guards.foreignKeySuffix(options.onDelete, options.onUpdate, options.deferrable)}`;
  }
}
