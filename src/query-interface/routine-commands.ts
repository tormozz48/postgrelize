import {
  FunctionDdl,
  type CreateFunctionOptions,
  type DropFunctionOptions,
  type FunctionName,
  type FunctionParam,
} from '../ddl/function-ddl.ts';
import type { TableName } from '../ddl/sql-literal.ts';
import {
  TriggerDdl,
  type CreateTriggerOptions,
  type DropTriggerOptions,
  type TriggerSpec,
} from '../ddl/trigger-ddl.ts';
import type { QueryOptionsBase } from '../model/runtime.ts';
import type { StatementRunner } from './statement-runner.ts';

const functions = new FunctionDdl();

const triggers = new TriggerDdl();

/**
 * Function and trigger DDL of `QueryInterface`. Names are quoted or guarded words, trigger
 * arguments are literals, function bodies are trusted SQL (ADR-025).
 *
 * @internal
 */
export class RoutineCommands {
  readonly #runner: StatementRunner;

  /**
   * @param runner - Statement runner.
   */
  constructor(runner: StatementRunner) {
    this.#runner = runner;
  }

  /**
   * Runs `CREATE FUNCTION`.
   *
   * @param name - Function name.
   * @param params - Parameters.
   * @param returnType - Return type.
   * @param language - Language.
   * @param body - Trusted body text.
   * @param optionsArray - Characteristic keywords.
   * @param options - Statement and query options.
   */
  async createFunction(
    name: FunctionName,
    params: readonly FunctionParam[],
    returnType: string,
    language: string,
    body: string,
    optionsArray: readonly string[],
    options: CreateFunctionOptions & QueryOptionsBase,
  ): Promise<void> {
    await this.#runner.run(
      functions.createSql(name, params, returnType, language, body, optionsArray, options),
      options ?? {},
    );
  }

  /**
   * Runs `DROP FUNCTION`.
   *
   * @param name - Function name.
   * @param params - Parameters identifying the overload.
   * @param options - Statement and query options.
   */
  async dropFunction(
    name: FunctionName,
    params: readonly FunctionParam[],
    options: DropFunctionOptions & QueryOptionsBase,
  ): Promise<void> {
    await this.#runner.run(functions.dropSql(name, params, options ?? {}), options ?? {});
  }

  /**
   * Runs `ALTER FUNCTION ... RENAME TO`.
   *
   * @param name - Current name.
   * @param params - Parameters identifying the overload.
   * @param newName - New name.
   * @param options - Query options.
   */
  async renameFunction(
    name: FunctionName,
    params: readonly FunctionParam[],
    newName: string,
    options: QueryOptionsBase,
  ): Promise<void> {
    await this.#runner.run(functions.renameSql(name, params, newName), options);
  }

  /**
   * Runs `CREATE TRIGGER`.
   *
   * @param spec - Trigger definition.
   * @param options - Statement and query options.
   */
  async createTrigger(
    spec: TriggerSpec,
    options: CreateTriggerOptions & QueryOptionsBase,
  ): Promise<void> {
    await this.#runner.run(triggers.createSql(spec, options), options);
  }

  /**
   * Runs `DROP TRIGGER`.
   *
   * @param table - Table.
   * @param name - Trigger name.
   * @param options - Statement and query options.
   */
  async dropTrigger(
    table: TableName,
    name: string,
    options: DropTriggerOptions & QueryOptionsBase,
  ): Promise<void> {
    await this.#runner.run(triggers.dropSql(table, name, options), options);
  }

  /**
   * Runs `ALTER TRIGGER ... RENAME TO`.
   *
   * @param table - Table.
   * @param name - Current name.
   * @param newName - New name.
   * @param options - Query options.
   */
  async renameTrigger(
    table: TableName,
    name: string,
    newName: string,
    options: QueryOptionsBase,
  ): Promise<void> {
    await this.#runner.run(triggers.renameSql(table, name, newName), options);
  }
}
