import type { CreateExtensionOptions, DropExtensionOptions } from '../ddl/extension-ddl.ts';
import type {
  AlterSequenceOptions,
  CreateSequenceOptions,
  DropSequenceOptions,
  SequenceNumber,
} from '../ddl/sequence-ddl.ts';
import type { TableName } from '../ddl/sql-literal.ts';
import type { QueryOptionsBase, RuntimeOwner } from '../model/runtime.ts';
import { ObjectCommands } from './object-commands.ts';
import { QueryInterfaceTables } from './query-interface-tables.ts';
import { StatementRunner } from './statement-runner.ts';

/**
 * Schema object part of {@link QueryInterface}: extensions and sequences.
 */
export class QueryInterfaceObjects extends QueryInterfaceTables {
  readonly #objects: ObjectCommands;

  /**
   * @param sequelize - Owning `Sequelize` instance.
   */
  constructor(sequelize: RuntimeOwner) {
    super(sequelize);
    this.#objects = new ObjectCommands(new StatementRunner(sequelize));
  }

  /**
   * Installs an extension with `CREATE EXTENSION`. Needs the privileges PostgreSQL requires for that extension (superuser or a trusted extension).
   *
   * @param name - Extension name, quoted as an identifier.
   * @param options - `ifNotExists`, `schema`, `version`, `cascade` and query options.
   * @throws DatabaseError when the extension is not available on the server or the role may not install it.
   *
   * @example
   * ```ts
   * await queryInterface.createExtension('pg_trgm', { ifNotExists: true });
   * ```
   * @see [Schema guide](/guide/schema)
   */
  async createExtension(
    name: string,
    options: CreateExtensionOptions & QueryOptionsBase = {},
  ): Promise<void> {
    await this.#objects.createExtension(name, options);
  }

  /**
   * Removes an extension with `DROP EXTENSION`.
   *
   * @param name - Extension name.
   * @param options - `ifExists`, `cascade` and query options.
   * @throws DatabaseError when objects depend on the extension and `cascade` is not set.
   *
   * @example
   * ```ts
   * await queryInterface.dropExtension('pg_trgm', { ifExists: true });
   * ```
   */
  async dropExtension(
    name: string,
    options: DropExtensionOptions & QueryOptionsBase = {},
  ): Promise<void> {
    await this.#objects.dropExtension(name, options);
  }

  /**
   * Creates a sequence with `CREATE SEQUENCE`. Numbers must be whole (`number` or `bigint`).
   *
   * @param name - Sequence name or `{ tableName, schema }`.
   * @param options - Sequence properties and query options.
   * @throws Error for an unknown `dataType` or a non-integer number.
   *
   * @example
   * ```ts
   * await queryInterface.createSequence('invoice_number', { start: 1000, increment: 1, cache: 10 });
   * ```
   */
  async createSequence(
    name: TableName,
    options: CreateSequenceOptions & QueryOptionsBase = {},
  ): Promise<void> {
    await this.#objects.createSequence(name, options);
  }

  /**
   * Changes a sequence with `ALTER SEQUENCE`.
   *
   * @param name - Sequence name or `{ tableName, schema }`.
   * @param options - Properties to change (at least one) and query options.
   * @throws Error when no property is given or a number is not whole.
   *
   * @example
   * ```ts
   * await queryInterface.alterSequence('invoice_number', { restartWith: 5000, cycle: false });
   * ```
   */
  async alterSequence(
    name: TableName,
    options: AlterSequenceOptions & QueryOptionsBase = {},
  ): Promise<void> {
    await this.#objects.alterSequence(name, options);
  }

  /**
   * Drops a sequence with `DROP SEQUENCE`.
   *
   * @param name - Sequence name or `{ tableName, schema }`.
   * @param options - `ifExists`, `cascade` and query options.
   *
   * @example
   * ```ts
   * await queryInterface.dropSequence('invoice_number', { ifExists: true });
   * ```
   */
  async dropSequence(
    name: TableName,
    options: DropSequenceOptions & QueryOptionsBase = {},
  ): Promise<void> {
    await this.#objects.dropSequence(name, options);
  }

  /**
   * Advances a sequence and returns the new value (`SELECT nextval(...)`; the name is bound).
   *
   * @param name - Sequence name or `{ tableName, schema }`.
   * @param options - Query options.
   * @returns The value as text, so bigint values stay exact.
   *
   * @example
   * ```ts
   * const next = await queryInterface.nextval('invoice_number');
   * ```
   */
  async nextval(name: TableName, options: QueryOptionsBase = {}): Promise<string> {
    return await this.#objects.nextval(name, options);
  }

  /**
   * Sets the current value of a sequence (`SELECT setval(...)`; name and value are bound).
   *
   * @param name - Sequence name or `{ tableName, schema }`.
   * @param value - New value (`number` or `bigint`).
   * @param isCalled - `true` (default): the next `nextval` returns `value + increment`; `false`: it returns `value`.
   * @param options - Query options.
   * @returns The value set, as text.
   *
   * @example
   * ```ts
   * await queryInterface.setval('invoice_number', 9000, false);
   * ```
   */
  async setval(
    name: TableName,
    value: SequenceNumber,
    isCalled = true,
    options: QueryOptionsBase = {},
  ): Promise<string> {
    return await this.#objects.setval(name, value, isCalled, options);
  }
}
