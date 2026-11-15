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
   * @param options - Isolation level and access mode of a top-level transaction.
   * @returns `START TRANSACTION …`, or `SAVEPOINT …` when nested.
   * @throws Error for an isolation level outside the allowlist.
   */
  begin(options: Readonly<{ isolationLevel?: IsolationLevel; readOnly?: boolean }>): string {
    if (this.#savepoint !== undefined) {
      return `SAVEPOINT ${this.#savepoint}`;
    }
    if (
      options.isolationLevel !== undefined &&
      !(Object.values(ISOLATION_LEVELS) as string[]).includes(options.isolationLevel)
    ) {
      throw new Error(`Invalid isolation level: ${String(options.isolationLevel)}`);
    }
    return [
      'START TRANSACTION',
      options.isolationLevel === undefined ? '' : ` ISOLATION LEVEL ${options.isolationLevel}`,
      options.readOnly === true ? ' READ ONLY' : '',
    ].join('');
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
