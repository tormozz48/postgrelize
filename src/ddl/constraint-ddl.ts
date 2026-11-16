import { SqlCompiler } from '../sql/compile.ts';
import { WhereCompiler } from '../where/where.ts';
import { DdlGuards } from './ddl-guards.ts';
import type { ConstraintOptions } from './ddl-types.ts';
import { IndexElementDdl } from './index-element-ddl.ts';
import { SqlLiteral, type TableName } from './sql-literal.ts';

const guards = new DdlGuards();

const elements = new IndexElementDdl();

const identity = new WhereCompiler({ resolve: (field) => ({ field }) });

const sqlLiteral = new SqlLiteral();

/**
 * `ALTER TABLE ... ADD CONSTRAINT` statements (check, unique, primary, foreign key and exclusion constraints).
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
   * @throws Error for an unknown constraint type, a foreign key without references, an `exclude`
   * without elements or a `notValid` on a constraint that cannot be `NOT VALID`.
   */
  addConstraintSql(table: TableName, options: ConstraintOptions, defaultSchema?: string): string {
    const type = options.type.toLowerCase();
    const name = options.name ?? this.#defaultName(table, this.#nameFields(type, options), type);
    const fields = (options.fields ?? []).map(SqlCompiler.quoteIdent).join(', ');
    const body = this.#body(type, fields, options, defaultSchema);
    return `ALTER TABLE ${sqlLiteral.quoteTable(table, defaultSchema)} ADD CONSTRAINT ${SqlCompiler.quoteIdent(name)} ${body}${this.#notValid(type, options)}`;
  }

  /**
   * `ALTER TABLE ... VALIDATE CONSTRAINT` statement.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param name - Constraint name.
   * @param defaultSchema - Schema used when the table reference has none.
   * @returns Statement.
   */
  validateConstraintSql(table: TableName, name: string, defaultSchema?: string): string {
    return `ALTER TABLE ${sqlLiteral.quoteTable(table, defaultSchema)} VALIDATE CONSTRAINT ${SqlCompiler.quoteIdent(name)}`;
  }

  #nameFields(type: string, options: ConstraintOptions): readonly string[] {
    if (type !== 'exclude') {
      return options.fields ?? [];
    }
    return (options.exclude ?? []).map((element) => {
      const name = element.name;
      if (name === undefined) {
        throw new Error('An exclusion constraint on an expression requires an explicit name');
      }
      return name;
    });
  }

  #notValid(type: string, options: ConstraintOptions): string {
    if (options.notValid !== true) {
      return '';
    }
    if (type !== 'check' && type !== 'foreign key') {
      throw new Error('notValid applies to check and foreign key constraints only');
    }
    return ' NOT VALID';
  }

  #defaultName(table: TableName, fields: readonly string[], type: string): string {
    const suffix = type
      .replace(' ', '_')
      .replace('primary_key', 'pk')
      .replace('foreign_key', 'fkey')
      .replace('check', 'ck')
      .replace('unique', 'uk')
      .replace('exclude', 'excl');
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
      case 'primary key':
        return this.#key(type, fields, options);
      case 'foreign key':
        return this.#foreignKey(fields, options, defaultSchema);
      case 'exclude':
        return this.#exclude(options);
      default:
        throw new Error(`Constraint type must be specified through options.type: ${options.type}`);
    }
  }

  #key(type: string, fields: string, options: ConstraintOptions): string {
    if (type === 'primary key') {
      return `PRIMARY KEY (${fields})`;
    }
    return `UNIQUE${options.nullsNotDistinct === true ? ' NULLS NOT DISTINCT' : ''} (${fields})`;
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

  #exclude(options: ConstraintOptions): string {
    const items = options.exclude ?? [];
    if (items.length === 0) {
      throw new Error('Exclusion constraint requires exclude elements');
    }
    const list = items
      .map((item) => `${elements.elementSql(item, undefined)} WITH ${guards.operator(item.with)}`)
      .join(', ');
    return [
      'EXCLUDE',
      options.using === undefined ? '' : ` USING ${guards.word(options.using, 'index method')}`,
      ` (${list})`,
      this.#excludeTail(options),
    ].join('');
  }

  #excludeTail(options: ConstraintOptions): string {
    return [
      options.include === undefined || options.include.length === 0
        ? ''
        : ` INCLUDE (${options.include.map(SqlCompiler.quoteIdent).join(', ')})`,
      options.where === undefined
        ? ''
        : ` WHERE (${sqlLiteral.inlineExpr(identity.compile(options.where))})`,
      options.deferrable === undefined ? '' : ` ${guards.deferrableSql(options.deferrable)}`,
    ].join('');
  }
}
