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
    const name = options.name ?? this.#defaultName(table, type, options);
    const fields = this.#fieldList(type, options);
    const body = this.#body(type, fields, options, defaultSchema);
    return `ALTER TABLE ${sqlLiteral.quoteTable(table, defaultSchema)} ADD CONSTRAINT ${SqlCompiler.quoteIdent(name)} ${body}${this.#attributes(type, options)}`;
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

  #attributes(type: string, options: ConstraintOptions): string {
    const checkable = type === 'check' || type === 'foreign key';
    if ((options.notValid === true || options.enforced === false) && !checkable) {
      throw new Error('notValid and enforced apply to check and foreign key constraints only');
    }
    return `${options.enforced === false ? ' NOT ENFORCED' : ''}${options.notValid === true ? ' NOT VALID' : ''}`;
  }

  #fieldList(type: string, options: ConstraintOptions): string {
    const names = (options.fields ?? []).map(SqlCompiler.quoteIdent);
    if (options.withoutOverlaps === true) {
      this.#requireType(type, ['unique', 'primary key'], 'withoutOverlaps');
      return this.#withLast(names, (last) => `${last} WITHOUT OVERLAPS`);
    }
    if (options.period === true) {
      this.#requireType(type, ['foreign key'], 'period');
      return this.#withLast(names, (last) => `PERIOD ${last}`);
    }
    return names.join(', ');
  }

  #requireType(type: string, allowed: readonly string[], option: string): void {
    if (!allowed.includes(type)) {
      throw new Error(`${option} applies to ${allowed.join(' and ')} constraints only`);
    }
  }

  #withLast(names: readonly string[], mark: (last: string) => string): string {
    const last = names.at(-1);
    if (last === undefined) {
      throw new Error('withoutOverlaps and period need at least one field');
    }
    return [...names.slice(0, -1), mark(last)].join(', ');
  }

  // v6 names: `<table>_<fields>_pk|uk|ck`, `<table>_<fields>_<referenced table>_fk`
  #defaultName(table: TableName, type: string, options: ConstraintOptions): string {
    const referenced = options.references?.table;
    const suffix =
      type === 'foreign key' && referenced !== undefined
        ? `${sqlLiteral.tableParts(referenced).name}_fk`
        : type
            .replace('primary key', 'pk')
            .replace('check', 'ck')
            .replace('unique', 'uk')
            .replace('exclude', 'excl');
    const fields = this.#nameFields(type, options).join('_');
    return `${sqlLiteral.tableParts(table).name}_${fields}_${suffix}`;
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
    const target = `FOREIGN KEY (${fields}) REFERENCES ${sqlLiteral.quoteTable(options.references.table, defaultSchema)} (${this.#referenced(options.references, options.period === true)})`;
    return `${target}${guards.foreignKeySuffix(options.onDelete, options.onUpdate, options.deferrable)}`;
  }

  #referenced(references: NonNullable<ConstraintOptions['references']>, period: boolean): string {
    const names = (references.fields ?? [references.field]).map(SqlCompiler.quoteIdent);
    return period ? this.#withLast(names, (last) => `PERIOD ${last}`) : names.join(', ');
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
