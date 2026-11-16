import {
  ExtensionDdl,
  type CreateExtensionOptions,
  type DropExtensionOptions,
} from '../ddl/extension-ddl.ts';
import {
  SequenceDdl,
  type AlterSequenceOptions,
  type CreateSequenceOptions,
  type DropSequenceOptions,
  type SequenceNumber,
} from '../ddl/sequence-ddl.ts';
import { SqlLiteral, type TableName } from '../ddl/sql-literal.ts';
import type { QueryOptionsBase } from '../model/runtime.ts';
import type { StatementRunner } from './statement-runner.ts';

const extensions = new ExtensionDdl();

const sequences = new SequenceDdl();

const sqlLiteral = new SqlLiteral();

/**
 * Extension and sequence DDL of `QueryInterface`. Names are quoted identifiers; sequence numbers
 * are validated integers; `nextval` / `setval` bind everything.
 *
 * @internal
 */
export class ObjectCommands {
  readonly #runner: StatementRunner;

  /**
   * @param runner - Statement runner.
   */
  constructor(runner: StatementRunner) {
    this.#runner = runner;
  }

  /**
   * Runs `CREATE EXTENSION`.
   *
   * @param name - Extension name.
   * @param options - Statement and query options.
   */
  async createExtension(
    name: string,
    options: CreateExtensionOptions & QueryOptionsBase,
  ): Promise<void> {
    await this.#runner.run(extensions.createSql(name, options), options);
  }

  /**
   * Runs `DROP EXTENSION`.
   *
   * @param name - Extension name.
   * @param options - Statement and query options.
   */
  async dropExtension(
    name: string,
    options: DropExtensionOptions & QueryOptionsBase,
  ): Promise<void> {
    await this.#runner.run(extensions.dropSql(name, options), options);
  }

  /**
   * Runs `CREATE SEQUENCE`.
   *
   * @param name - Sequence name.
   * @param options - Sequence and query options.
   */
  async createSequence(
    name: TableName,
    options: CreateSequenceOptions & QueryOptionsBase,
  ): Promise<void> {
    await this.#runner.run(sequences.createSql(name, options), options);
  }

  /**
   * Runs `ALTER SEQUENCE`.
   *
   * @param name - Sequence name.
   * @param options - Properties to change and query options.
   */
  async alterSequence(
    name: TableName,
    options: AlterSequenceOptions & QueryOptionsBase,
  ): Promise<void> {
    await this.#runner.run(sequences.alterSql(name, options), options);
  }

  /**
   * Runs `DROP SEQUENCE`.
   *
   * @param name - Sequence name.
   * @param options - Statement and query options.
   */
  async dropSequence(
    name: TableName,
    options: DropSequenceOptions & QueryOptionsBase,
  ): Promise<void> {
    await this.#runner.run(sequences.dropSql(name, options), options);
  }

  /**
   * Advances a sequence and returns the new value.
   *
   * @param name - Sequence name.
   * @param options - Query options.
   * @returns Value as text (bigint safe).
   */
  async nextval(name: TableName, options: QueryOptionsBase): Promise<string> {
    const result = await this.#runner.execute(
      { text: 'SELECT nextval($1::regclass) AS value', values: [sqlLiteral.quoteTable(name)] },
      options,
    );
    return String(result.rows[0]?.['value']);
  }

  /**
   * Sets the current value of a sequence.
   *
   * @param name - Sequence name.
   * @param value - New value.
   * @param isCalled - `false` makes the next `nextval` return `value` itself.
   * @param options - Query options.
   * @returns The value set, as text.
   */
  async setval(
    name: TableName,
    value: SequenceNumber,
    isCalled: boolean,
    options: QueryOptionsBase,
  ): Promise<string> {
    const result = await this.#runner.execute(
      {
        text: 'SELECT setval($1::regclass, $2::bigint, $3::boolean) AS value',
        values: [sqlLiteral.quoteTable(name), value.toString(), isCalled],
      },
      options,
    );
    return String(result.rows[0]?.['value']);
  }
}
