import { Deferrable, type DeferrableValue } from './ddl-types.ts';

const ACTIONS: ReadonlySet<string> = new Set([
  'CASCADE',
  'SET NULL',
  'SET DEFAULT',
  'RESTRICT',
  'NO ACTION',
]);

const IDENTIFIER_PATTERN = /^[A-Za-z_][\w]*$/;

const OPERATOR_PATTERN = /^[-+*/<>=~!@#%^&|`?]{1,63}$/;

const DEFERRABLE_SQL: ReadonlySet<string> = new Set(
  Object.values(Deferrable).map((value) => value.sql),
);

/**
 * Allowlists for the DDL keywords that cannot be quoted: referential actions, deferrable modes,
 * index methods and operator classes (ADR-020).
 *
 * @internal
 */
export class DdlGuards {
  /**
   * SQL of a `Deferrable` value; anything that is not one of them is rejected.
   *
   * @param value - Deferrable value.
   * @returns SQL of the mode.
   * @throws Error for anything but a `Deferrable` constant.
   */
  deferrableSql(value: DeferrableValue): string {
    if (!DEFERRABLE_SQL.has((value as { sql?: unknown } | undefined)?.sql as string)) {
      throw new Error(`Invalid deferrable: use one of the Deferrable constants`);
    }
    return value.sql;
  }

  /**
   * Normalized referential action (`ON DELETE` / `ON UPDATE`).
   *
   * @param action - Action as given.
   * @returns Upper-case action.
   * @throws Error for an action outside the allowlist.
   */
  action(action: string): string {
    const normalized = action.trim().toUpperCase();
    if (!ACTIONS.has(normalized)) {
      throw new Error(`Invalid referential action: ${action}`);
    }
    return normalized;
  }

  /**
   * A plain identifier word (index method, operator class), rendered unquoted.
   *
   * @param value - Word.
   * @param kind - Kind named in the error.
   * @returns The word.
   * @throws Error for anything but `[A-Za-z_][\w]*`.
   */
  word(value: string, kind: string): string {
    if (!IDENTIFIER_PATTERN.test(value)) {
      throw new Error(`Invalid ${kind}: ${value}`);
    }
    return value;
  }

  /**
   * An operator symbol (EXCLUDE `WITH` operator), rendered unquoted.
   *
   * @param value - Operator such as `&&` or `=`.
   * @returns The operator.
   * @throws Error for anything but 1-63 operator characters, or one that opens a comment.
   */
  operator(value: string): string {
    if (!OPERATOR_PATTERN.test(value) || value.includes('--') || value.includes('/*')) {
      throw new Error(`Invalid operator: ${value}`);
    }
    return value;
  }

  /**
   * A whole number rendered into DDL (sequence bounds, cache size); anything else is rejected.
   *
   * @param value - Number or bigint.
   * @param kind - Kind named in the error.
   * @returns Decimal text of the number.
   * @throws Error for non-integers and unsafe numbers.
   */
  integer(value: number | bigint, kind: string): string {
    if (typeof value === 'bigint' || Number.isSafeInteger(value)) {
      return value.toString();
    }
    throw new Error(`Invalid ${kind}: expected a whole number`);
  }

  /**
   * ` ON DELETE ... ON UPDATE ... <deferrable>` suffix of a foreign key; empty parts are omitted.
   *
   * @param onDelete - `ON DELETE` action.
   * @param onUpdate - `ON UPDATE` action.
   * @param deferrable - Deferrable mode.
   * @returns SQL suffix.
   */
  foreignKeySuffix(
    onDelete: string | undefined,
    onUpdate: string | undefined,
    deferrable: DeferrableValue | undefined,
  ): string {
    return [
      onDelete === undefined ? '' : ` ON DELETE ${this.action(onDelete)}`,
      onUpdate === undefined ? '' : ` ON UPDATE ${this.action(onUpdate)}`,
      deferrable === undefined ? '' : ` ${this.deferrableSql(deferrable)}`,
    ].join('');
  }
}
