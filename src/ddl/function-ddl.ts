import { RoutineGuards } from './routine-guards.ts';
import { SqlLiteral } from './sql-literal.ts';

const guards = new RoutineGuards();

const sqlLiteral = new SqlLiteral();

/** Function reference: a plain name (`'touch'`, `'app.touch'`) or `{ name, schema }` (quoted exactly). */
export type FunctionName =
  | string
  | Readonly<{
      /** Function name, quoted exactly. */
      name: string;
      /** Schema name, quoted exactly. */
      schema?: string;
    }>;

/** Parameter of a function. */
export type FunctionParam = Readonly<{
  /** SQL type, e.g. `'integer'`, `'varchar(10)'`, `'text[]'`. */
  type: string;
  /** Parameter name (identifier word). */
  name?: string;
  /** `IN`, `OUT`, `INOUT` or `VARIADIC`. */
  direction?: string;
}>;

/** Local variable declared before `BEGIN`. */
export type FunctionVariable = Readonly<{
  /** Variable name (identifier word). */
  name: string;
  /** SQL type. */
  type: string;
  /** Initial value, rendered as a literal. */
  default?: unknown;
}>;

/**
 * Options of `createFunction`.
 *
 * @example
 * ```ts
 * const options: CreateFunctionOptions = {
 *   force: true,
 *   variables: [{ name: 'limit_rows', type: 'integer', default: 100 }],
 * };
 * await queryInterface.createFunction('f', [], 'integer', 'plpgsql', 'RETURN limit_rows;', [], options);
 * ```
 */
export type CreateFunctionOptions = Readonly<{
  /** Local variables (`DECLARE name type := default;`). */
  variables?: readonly FunctionVariable[];
  /** `CREATE OR REPLACE FUNCTION`. */
  force?: boolean;
}>;

/**
 * Options of `dropFunction`.
 *
 * @example
 * ```ts
 * const options: DropFunctionOptions = { ifExists: true, cascade: true };
 * await queryInterface.dropFunction('f', [], options);
 * ```
 */
export type DropFunctionOptions = Readonly<{
  /** Adds `IF EXISTS`. */
  ifExists?: boolean;
  /** `CASCADE` instead of the default `RESTRICT`. */
  cascade?: boolean;
}>;

/**
 * `CREATE`, `DROP` and `ALTER ... RENAME` statements for functions (Sequelize v6 shapes).
 *
 * @internal
 */
export class FunctionDdl {
  /**
   * `CREATE [OR REPLACE] FUNCTION` statement; the body is wrapped in `BEGIN ... END;` like v6.
   *
   * @param name - Function name.
   * @param params - Parameters.
   * @param returnType - Return type.
   * @param language - Language word.
   * @param body - Trusted SQL / PL/pgSQL text.
   * @param optionsArray - Characteristic keywords.
   * @param options - Statement options.
   * @returns Statement.
   * @throws Error for missing parts or values outside the guards.
   */
  createSql(
    name: FunctionName,
    params: readonly FunctionParam[],
    returnType: string,
    language: string,
    body: string,
    optionsArray: readonly string[],
    options: CreateFunctionOptions,
  ): string {
    this.#require([name, returnType, language, body]);
    // v6 takes `null` options, and `null` or `{}` for the characteristics
    const given = options ?? {};
    return [
      this.#head(name, params, given),
      ` RETURNS ${guards.typeName(returnType, 'return type')}`,
      this.#body(body, this.#variables(given.variables)),
      ` LANGUAGE ${guards.word(language, 'language')}`,
      ...guards.functionOptions(this.#characteristics(optionsArray)).map((option) => ` ${option}`),
    ].join('');
  }

  /**
   * `DROP FUNCTION` statement (`RESTRICT` unless `cascade`).
   *
   * @param name - Function name.
   * @param params - Parameters identifying the overload.
   * @param options - Statement options.
   * @returns Statement.
   */
  dropSql(
    name: FunctionName,
    params: readonly FunctionParam[],
    options: DropFunctionOptions,
  ): string {
    if (!name) {
      throw new Error('requires functionName');
    }
    return `DROP FUNCTION ${options.ifExists === true ? 'IF EXISTS ' : ''}${guards.functionName(name)}(${this.#params(params)}) ${options.cascade === true ? 'CASCADE' : 'RESTRICT'}`;
  }

  /**
   * `ALTER FUNCTION ... RENAME TO` statement.
   *
   * @param name - Current name.
   * @param params - Parameters identifying the overload.
   * @param newName - New unqualified name.
   * @returns Statement.
   */
  renameSql(name: FunctionName, params: readonly FunctionParam[], newName: string): string {
    return `ALTER FUNCTION ${guards.functionName(name)}(${this.#params(params)}) RENAME TO ${guards.word(newName, 'function name')}`;
  }

  #characteristics(given: unknown): readonly string[] {
    const empty =
      given === null || (typeof given === 'object' && Object.keys(given as object).length === 0);
    return empty ? [] : (given as readonly string[]);
  }

  #variables(variables: unknown): readonly FunctionVariable[] {
    if (!variables) {
      return [];
    }
    if (!Array.isArray(variables)) {
      throw new Error('_expandFunctionVariableList: function variables must be an array');
    }
    const list = variables as readonly FunctionVariable[];
    if (list.some((variable) => !variable.name || !variable.type)) {
      throw new Error('function variable must have a name and type');
    }
    return list;
  }

  #params(params: readonly FunctionParam[]): string {
    if (!Array.isArray(params)) {
      throw new Error(
        'function parameters array required, including an empty one for no arguments',
      );
    }
    return (params as readonly FunctionParam[])
      .map((param) =>
        [
          param.direction === undefined ? '' : guards.direction(param.direction),
          param.name === undefined ? '' : guards.word(param.name, 'parameter name'),
          guards.typeName(this.#typed(param), 'parameter type'),
        ]
          .filter((part) => part !== '')
          .join(' '),
      )
      .join(', ');
  }

  #typed(param: FunctionParam): string {
    if (!param.type) {
      throw new Error('function or trigger used with a parameter without any type');
    }
    return param.type;
  }

  #require(parts: readonly unknown[]): void {
    if (parts.some((part) => !part)) {
      throw new Error(
        'createFunction missing some parameters. Did you pass functionName, returnType, language and body?',
      );
    }
  }

  #head(
    name: FunctionName,
    params: readonly FunctionParam[],
    options: CreateFunctionOptions,
  ): string {
    return `CREATE ${options.force === true ? 'OR REPLACE ' : ''}FUNCTION ${guards.functionName(name)}(${this.#params(params)})`;
  }

  #body(body: string, variables: readonly FunctionVariable[]): string {
    const tag = this.#tag(body);
    const declared = variables.map((variable) => this.#variable(variable)).join(' ');
    return ` AS ${tag} ${declared} BEGIN ${body} END; ${tag}`;
  }

  #variable(variable: FunctionVariable): string {
    const initial =
      variable.default === undefined ? '' : ` := ${sqlLiteral.escape(variable.default)}`;
    return `DECLARE ${guards.word(variable.name, 'variable name')} ${guards.typeName(variable.type, 'variable type')}${initial};`;
  }

  #tag(body: string): string {
    let tag = '$func$';
    for (let index = 1; body.includes(tag); index += 1) {
      tag = `$func${index}$`;
    }
    return tag;
  }
}
