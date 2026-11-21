import { SET_CONSTRAINTS_VALUES, type DeferrableValue } from '../ddl/ddl-types.ts';
import { SqlCompiler } from '../sql/compile.ts';
import { ISOLATION_LEVELS, type IsolationLevel } from './transaction-constants.ts';

/** SQL statements that start and finish a transaction, or a savepoint when it is nested. */
export class TransactionStatements {
  readonly #savepoint: string | undefined;

  /**
   * @param id - Transaction id, quoted as the savepoint name.
   * @param nested - Whether the transaction is a savepoint inside a parent transaction.
   */
  constructor(id: string, nested: boolean) {
    this.#savepoint = nested ? SqlCompiler.quoteIdent(id) : undefined;
  }

  /**
   * @param options - Isolation level, access mode and deferrable mode of a top-level transaction.
   * @returns `START TRANSACTION …`, or `SAVEPOINT …` when nested.
   * @throws Error for an isolation level outside the allowlist or a non-boolean `deferrable`.
   */
  begin(
    options: Readonly<{
      isolationLevel?: IsolationLevel;
      readOnly?: boolean;
      deferrable?: boolean | DeferrableValue;
    }>,
  ): string {
    if (this.#savepoint !== undefined) {
      return `SAVEPOINT ${this.#savepoint}`;
    }
    return `START TRANSACTION${TransactionStatements.#modes(options)}`;
  }

  static #modes(
    options: Readonly<{
      isolationLevel?: IsolationLevel;
      readOnly?: boolean;
      deferrable?: boolean | DeferrableValue;
    }>,
  ): string {
    if (
      options.isolationLevel !== undefined &&
      !(Object.values(ISOLATION_LEVELS) as string[]).includes(options.isolationLevel)
    ) {
      throw new Error(`Invalid isolation level: ${String(options.isolationLevel)}`);
    }
    return [
      options.isolationLevel === undefined ? '' : ` ISOLATION LEVEL ${options.isolationLevel}`,
      options.readOnly === true ? ' READ ONLY' : '',
      TransactionStatements.#deferrable(options.deferrable),
    ].join('');
  }

  static #deferrable(deferrable: unknown): string {
    if (
      typeof deferrable === 'object' &&
      deferrable !== null &&
      SET_CONSTRAINTS_VALUES.has(deferrable)
    ) {
      return '';
    }
    if (typeof deferrable === 'function' && SET_CONSTRAINTS_VALUES.has(deferrable)) {
      return '';
    }
    if (deferrable !== undefined && typeof deferrable !== 'boolean') {
      throw new Error(`Invalid deferrable option: ${String(deferrable)}`);
    }
    return deferrable === undefined ? '' : deferrable ? ' DEFERRABLE' : ' NOT DEFERRABLE';
  }

  /**
   * @returns `COMMIT`, or `RELEASE SAVEPOINT …` when nested.
   */
  commit(): string {
    return this.#savepoint === undefined ? 'COMMIT' : `RELEASE SAVEPOINT ${this.#savepoint}`;
  }

  /**
   * @returns `ROLLBACK`, or `ROLLBACK TO SAVEPOINT …` when nested.
   */
  rollback(): string {
    return this.#savepoint === undefined ? 'ROLLBACK' : `ROLLBACK TO SAVEPOINT ${this.#savepoint}`;
  }
}
