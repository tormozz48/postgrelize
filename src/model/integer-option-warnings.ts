import type { DataType } from '../data-types/abstract-data-type.ts';
import type { IntegerType } from '../data-types/integer-type.ts';

// the types v6 warns about on PostgreSQL
const WARNED_KEYS: ReadonlySet<string> = new Set(['TINYINT', 'SMALLINT', 'INTEGER', 'BIGINT']);

/**
 * The v6 console warning for a model attribute whose integer type has options PostgreSQL ignores,
 * printed once per type in a process.
 *
 * @internal
 */
export class IntegerOptionWarnings {
  readonly #printed = new Set<string>();

  check(type: DataType): void {
    if (!WARNED_KEYS.has(type.key) || this.#printed.has(type.key)) {
      return;
    }
    // a bare chain (`TINYINT.UNSIGNED`) is a function carrying the options; a raw type name has none
    const { length, unsigned, zerofill } = (type as Partial<IntegerType>).options ?? {};
    if (length || unsigned || zerofill) {
      this.#printed.add(type.key);
      console.warn(
        `(sequelize) Warning: PostgresSQL does not support '${type.key}' with LENGTH, UNSIGNED or ZEROFILL. Plain '${type.key}' will be used instead. 
>> Check: http://www.postgresql.org/docs/9.4/static/datatype.html`,
      );
    }
  }
}
