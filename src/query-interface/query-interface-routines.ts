import type {
  CreateFunctionOptions,
  DropFunctionOptions,
  FunctionName,
  FunctionParam,
} from '../ddl/function-ddl.ts';
import type { TableName } from '../ddl/sql-literal.ts';
import type {
  CreateTriggerOptions,
  DropTriggerOptions,
  TriggerArgument,
  TriggerEvent,
  TriggerTiming,
} from '../ddl/trigger-ddl.ts';
import type { QueryOptionsBase, RuntimeOwner } from '../model/runtime.ts';
import { QueryInterfaceObjects } from './query-interface-objects.ts';
import { RoutineCommands } from './routine-commands.ts';
import { StatementRunner } from './statement-runner.ts';

/**
 * Function and trigger part of {@link QueryInterface}.
 */
export class QueryInterfaceRoutines extends QueryInterfaceObjects {
  readonly #routines: RoutineCommands;

  /**
   * @param sequelize - Owning `Sequelize` instance.
   */
  constructor(sequelize: RuntimeOwner) {
    super(sequelize);
    this.#routines = new RoutineCommands(new StatementRunner(sequelize));
  }

  /**
   * Creates a function with `CREATE [OR REPLACE] FUNCTION` (Sequelize v6 `createFunction`). The body is wrapped in `BEGIN ... END;` as in v6.
   *
   * The `body` is SQL text you provide: it is not escaped, so never build it from user input. Names, parameter names and the language are validated identifier words; types and characteristic keywords are checked against strict patterns and allowlists. A function name given as a string is unquoted (folds to lower case, like v6); use `{ name, schema }` for an exact quoted name.
   *
   * @param name - Function name (`'touch'`, `'app.touch'` or `{ name, schema }`).
   * @param params - Parameters `{ type, name?, direction? }`; pass `[]` for none.
   * @param returnType - Return type, e.g. `'trigger'`, `'integer'`, `'SETOF text'`.
   * @param language - Language, e.g. `'plpgsql'`.
   * @param body - Trusted function body without `BEGIN` / `END`.
   * @param optionsArray - Characteristic keywords such as `'IMMUTABLE'`, `'SECURITY DEFINER'`, `'COST 10'`.
   * @param options - `variables`, `force` (`OR REPLACE`) and query options.
   * @throws Error when a part is missing or fails validation.
   * @throws DatabaseError when PostgreSQL rejects the function.
   *
   * @example
   * ```ts
   * await queryInterface.createFunction(
   *   'touch_updated_at',
   *   [],
   *   'trigger',
   *   'plpgsql',
   *   'NEW."updatedAt" := now(); RETURN NEW;',
   *   ['VOLATILE'],
   *   { force: true },
   * );
   * ```
   * @see [Schema objects guide](/guide/schema-objects)
   */
  async createFunction(
    name: FunctionName,
    params: readonly FunctionParam[],
    returnType: string,
    language: string,
    body: string,
    optionsArray: readonly string[] = [],
    options: CreateFunctionOptions & QueryOptionsBase = {},
  ): Promise<void> {
    await this.#routines.createFunction(
      name,
      params,
      returnType,
      language,
      body,
      optionsArray,
      options,
    );
  }

  /**
   * Drops a function with `DROP FUNCTION ... RESTRICT` (Sequelize v6 `dropFunction`).
   *
   * @param name - Function name.
   * @param params - Parameters that identify the overload; pass `[]` for none.
   * @param options - `ifExists`, `cascade` and query options.
   *
   * @example
   * ```ts
   * await queryInterface.dropFunction('touch_updated_at', [], { ifExists: true });
   * ```
   */
  async dropFunction(
    name: FunctionName,
    params: readonly FunctionParam[],
    options: DropFunctionOptions & QueryOptionsBase = {},
  ): Promise<void> {
    await this.#routines.dropFunction(name, params, options);
  }

  /**
   * Renames a function with `ALTER FUNCTION ... RENAME TO` (Sequelize v6 `renameFunction`).
   *
   * @param name - Current function name.
   * @param params - Parameters that identify the overload.
   * @param newName - New unqualified name.
   * @param options - Query options.
   *
   * @example
   * ```ts
   * await queryInterface.renameFunction('touch_updated_at', [], 'set_updated_at');
   * ```
   */
  async renameFunction(
    name: FunctionName,
    params: readonly FunctionParam[],
    newName: string,
    options: QueryOptionsBase = {},
  ): Promise<void> {
    await this.#routines.renameFunction(name, params, newName, options);
  }

  /**
   * Creates a trigger with `CREATE TRIGGER` (Sequelize v6 `createTrigger`; `'after_constraint'` creates a `CONSTRAINT TRIGGER`).
   *
   * `functionArgs` are rendered as literals (v6 rendered typed parameter declarations, which PostgreSQL rejects). The `optionsArray` clauses are checked against an allowlist (`'FOR EACH ROW'`, `'FOR EACH STATEMENT'`, `'DEFERRABLE'`, `'INITIALLY DEFERRED'`, `REFERENCING ... TABLE AS name`); a `WHEN (condition)` clause is trusted SQL and is not escaped.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param name - Trigger name.
   * @param timing - `'before'`, `'after'`, `'instead_of'` or `'after_constraint'`.
   * @param events - Events that fire the trigger: `'insert'`, `'update'`, `'delete'`, `'truncate'`.
   * @param functionName - Trigger function (see {@link QueryInterface.createFunction}).
   * @param functionArgs - Literal arguments for the function; pass `[]` for none.
   * @param optionsArray - Clauses such as `['FOR EACH ROW']`.
   * @param options - `replace` (`OR REPLACE`, PostgreSQL 14+) and query options.
   * @throws Error for an unknown timing, event or clause.
   *
   * @example
   * ```ts
   * await queryInterface.createTrigger('Posts', 'posts_touch', 'before', ['insert', 'update'], 'touch_updated_at', [], ['FOR EACH ROW']);
   * ```
   */
  async createTrigger(
    table: TableName,
    name: string,
    timing: TriggerTiming,
    events: readonly TriggerEvent[],
    functionName: FunctionName,
    functionArgs: readonly TriggerArgument[] = [],
    optionsArray: readonly string[] = [],
    options: CreateTriggerOptions & QueryOptionsBase = {},
  ): Promise<void> {
    const spec = { table, name, timing, events, functionName, functionArgs, optionsArray };
    await this.#routines.createTrigger(spec, options);
  }

  /**
   * Drops a trigger with `DROP TRIGGER ... RESTRICT` (Sequelize v6 `dropTrigger`).
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param name - Trigger name.
   * @param options - `ifExists`, `cascade` and query options.
   *
   * @example
   * ```ts
   * await queryInterface.dropTrigger('Posts', 'posts_touch', { ifExists: true });
   * ```
   */
  async dropTrigger(
    table: TableName,
    name: string,
    options: DropTriggerOptions & QueryOptionsBase = {},
  ): Promise<void> {
    await this.#routines.dropTrigger(table, name, options);
  }

  /**
   * Renames a trigger with `ALTER TRIGGER ... RENAME TO` (Sequelize v6 `renameTrigger`).
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param name - Current trigger name.
   * @param newName - New trigger name.
   * @param options - Query options.
   *
   * @example
   * ```ts
   * await queryInterface.renameTrigger('Posts', 'posts_touch', 'posts_set_updated_at');
   * ```
   */
  async renameTrigger(
    table: TableName,
    name: string,
    newName: string,
    options: QueryOptionsBase = {},
  ): Promise<void> {
    await this.#routines.renameTrigger(table, name, newName, options);
  }
}
