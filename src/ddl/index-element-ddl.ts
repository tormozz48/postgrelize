import { SqlCompiler } from '../sql/compile.ts';
import { DdlGuards } from './ddl-guards.ts';
import type { IndexField } from './ddl-types.ts';

const guards = new DdlGuards();

/**
 * One element of an index or EXCLUDE constraint: a quoted column or a trusted SQL expression with
 * collation, operator class, order and nulls ordering.
 *
 * @internal
 */
export class IndexElementDdl {
  /**
   * SQL of an element.
   *
   * @param field - Column name or field object.
   * @param operator - Default operator class.
   * @returns Element SQL.
   * @throws Error for an empty expression or an invalid operator class.
   */
  elementSql(field: IndexField, operator: string | undefined): string {
    if (typeof field === 'string') {
      return `${SqlCompiler.quoteIdent(field)}${this.#operatorClass(operator)}`;
    }
    return [
      field.expression === undefined
        ? SqlCompiler.quoteIdent(field.name)
        : this.#expression(field.expression),
      field.collate === undefined ? '' : ` COLLATE ${SqlCompiler.quoteIdent(field.collate)}`,
      this.#operatorClass(field.operator ?? operator),
      field.order === undefined ? '' : ` ${field.order === 'DESC' ? 'DESC' : 'ASC'}`,
      field.nulls === undefined ? '' : ` NULLS ${field.nulls === 'FIRST' ? 'FIRST' : 'LAST'}`,
    ].join('');
  }

  #expression(expression: string): string {
    if (typeof expression !== 'string' || expression.trim() === '') {
      throw new Error('Index expression must be a non-empty SQL string');
    }
    return `(${expression})`;
  }

  #operatorClass(operator: string | undefined): string {
    return operator === undefined ? '' : ` ${guards.word(operator, 'operator class')}`;
  }
}
