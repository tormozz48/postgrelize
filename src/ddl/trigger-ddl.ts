import { SqlCompiler } from '../sql/compile.ts';
import { type FunctionName } from './function-ddl.ts';
import { RoutineGuards } from './routine-guards.ts';
import { SqlLiteral, type TableName } from './sql-literal.ts';

const guards = new RoutineGuards();

const sqlLiteral = new SqlLiteral();

const TIMINGS: Readonly<Record<string, string>> = {
  before: 'BEFORE',
  after: 'AFTER',
  instead_of: 'INSTEAD OF',
  after_constraint: 'AFTER',
};

const EVENTS: Readonly<Record<string, string>> = {
  insert: 'INSERT',
  update: 'UPDATE',
  delete: 'DELETE',
  truncate: 'TRUNCATE',
};

/** When a trigger fires relative to the event (Sequelize v6 values). */
export type TriggerTiming = 'before' | 'after' | 'instead_of' | 'after_constraint';

/** Table event that fires a trigger. */
export type TriggerEvent = 'insert' | 'update' | 'delete' | 'truncate';

/** Argument passed to the trigger function, rendered as a literal. */
export type TriggerArgument = string | number | boolean | bigint;

/**
 * Options of `createTrigger`.
 *
 * @example
 * ```ts
 * const options: CreateTriggerOptions = { replace: true };
 * await queryInterface.createTrigger('Posts', 'posts_touch', 'before', ['update'], 'touch', [], [], options);
 * ```
 */
export type CreateTriggerOptions = Readonly<{
  /** `CREATE OR REPLACE TRIGGER` (PostgreSQL 14+). */
  replace?: boolean;
}>;

/**
 * Options of `dropTrigger`.
 *
 * @example
 * ```ts
 * const options: DropTriggerOptions = { ifExists: true };
 * await queryInterface.dropTrigger('Posts', 'posts_touch', options);
 * ```
 */
export type DropTriggerOptions = Readonly<{
  /** Adds `IF EXISTS`. */
  ifExists?: boolean;
  /** `CASCADE` instead of the default `RESTRICT`. */
  cascade?: boolean;
}>;

/** Definition of a trigger (the arguments of `createTrigger` before the options). @internal */
export type TriggerSpec = Readonly<{
  table: TableName;
  name: string;
  timing: TriggerTiming;
  events: readonly TriggerEvent[];
  functionName: FunctionName;
  functionArgs: readonly TriggerArgument[];
  optionsArray: readonly string[];
}>;

const own = (map: Readonly<Record<string, string>>, key: unknown): string | undefined =>
  typeof key === 'string' && Object.hasOwn(map, key) ? map[key] : undefined;

/**
 * `CREATE`, `DROP` and `ALTER ... RENAME` statements for triggers (Sequelize v6 shapes).
 *
 * @internal
 */
export class TriggerDdl {
  /**
   * `CREATE [CONSTRAINT] TRIGGER` statement.
   *
   * @param spec - Trigger definition.
   * @param options - Statement options.
   * @returns Statement.
   * @throws Error for an unknown timing, event or clause.
   */
  createSql(spec: TriggerSpec, options: CreateTriggerOptions): string {
    const clauses = guards.triggerOptions(spec.optionsArray).map((clause) => ` ${clause}`);
    const head = `CREATE ${options.replace === true ? 'OR REPLACE ' : ''}${spec.timing === 'after_constraint' ? 'CONSTRAINT ' : ''}TRIGGER ${SqlCompiler.quoteIdent(spec.name)}`;
    return [
      head,
      ` ${this.#timing(spec.timing)} ${this.#events(spec.events)} ON ${sqlLiteral.quoteTable(spec.table)}`,
      clauses.join(''),
      ` EXECUTE FUNCTION ${guards.functionName(spec.functionName)}(${this.#args(spec.functionArgs)})`,
    ].join('');
  }

  /**
   * `DROP TRIGGER` statement (`RESTRICT` unless `cascade`).
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param name - Trigger name.
   * @param options - Statement options.
   * @returns Statement.
   */
  dropSql(table: TableName, name: string, options: DropTriggerOptions): string {
    return `DROP TRIGGER ${options.ifExists === true ? 'IF EXISTS ' : ''}${SqlCompiler.quoteIdent(name)} ON ${sqlLiteral.quoteTable(table)} ${options.cascade === true ? 'CASCADE' : 'RESTRICT'}`;
  }

  /**
   * `ALTER TRIGGER ... RENAME TO` statement.
   *
   * @param table - Table name or `{ tableName, schema }`.
   * @param name - Current trigger name.
   * @param newName - New trigger name.
   * @returns Statement.
   */
  renameSql(table: TableName, name: string, newName: string): string {
    return `ALTER TRIGGER ${SqlCompiler.quoteIdent(name)} ON ${sqlLiteral.quoteTable(table)} RENAME TO ${SqlCompiler.quoteIdent(newName)}`;
  }

  #timing(timing: TriggerTiming): string {
    const sql = own(TIMINGS, timing);
    if (sql === undefined) {
      throw new Error(`Invalid trigger event specified: ${String(timing)}`);
    }
    return sql;
  }

  #events(events: readonly TriggerEvent[]): string {
    if (!Array.isArray(events) || events.length === 0) {
      throw new Error('no table change events specified to trigger on');
    }
    return events
      .map((event) => {
        const sql = own(EVENTS, event);
        if (sql === undefined) {
          throw new Error(`parseTriggerEventSpec: undefined trigger event ${String(event)}`);
        }
        return sql;
      })
      .join(' OR ');
  }

  #args(args: readonly TriggerArgument[]): string {
    if (!Array.isArray(args)) {
      throw new Error('trigger arguments array required, including an empty one for no arguments');
    }
    return args
      .map((arg) => {
        if (typeof arg === 'object' || typeof arg === 'function') {
          throw new Error('trigger arguments must be strings, numbers, booleans or bigints');
        }
        return sqlLiteral.escape(arg);
      })
      .join(', ');
  }
}
