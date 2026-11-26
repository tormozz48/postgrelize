import { SqlLiteral } from '../ddl/sql-literal.ts';
import type { CompiledQuery } from '../sql/compile.ts';
import type { LoggingFunction } from './options.ts';

/** Logging settings: instance defaults or per-query overrides. */
export type QueryLogSettings = Readonly<{
  /** SQL logger, or `false` to disable. */
  logging?: LoggingFunction | false;
  /** Pass the query duration to the logger. */
  benchmark?: boolean;
  /** Transaction id shown in the log line. */
  transactionId?: string;
}>;

/** Writes executed SQL to the configured logger (Sequelize v6 `logging` / `benchmark` output). */
export class QueryLogger {
  readonly #defaults: QueryLogSettings;

  /**
   * Logger for the `logging` / `benchmark` constructor options (`console.log` when `logging` is unset).
   *
   * @param options - Instance-level options.
   * @returns Logger.
   */
  static fromOptions(options: QueryLogSettings): QueryLogger {
    return new QueryLogger({
      logging: options.logging === undefined ? console.log : options.logging,
      ...(options.benchmark === undefined ? {} : { benchmark: options.benchmark }),
    });
  }

  /**
   * @param defaults - Instance-level `logging` and `benchmark` settings.
   */
  constructor(defaults: QueryLogSettings) {
    this.#defaults = defaults;
  }

  /**
   * Whether a statement run with these settings is logged, so callers can skip timing it.
   *
   * @param options - Per-query settings overriding the defaults.
   * @returns True when a logger is configured.
   */
  enabled(options: QueryLogSettings): boolean {
    const logging = options.logging ?? this.#defaults.logging;
    return logging !== false && logging !== undefined;
  }

  // Like v6 for a finder, the logged text carries the values, so it can be run as it is; the statement
  // sent to PostgreSQL keeps its bound parameters, and `bind` stays in the second argument.
  static #inlined(query: CompiledQuery): string {
    try {
      return new SqlLiteral().inlineValues(query);
    } catch {
      return query.text;
    }
  }

  /**
   * Logs one executed statement.
   *
   * @param query - Executed query.
   * @param options - Per-query settings overriding the defaults.
   * @param elapsed - Duration in milliseconds.
   */
  log(query: CompiledQuery, options: QueryLogSettings, elapsed: number): void {
    const given: unknown = options.logging ?? this.#defaults.logging;
    if (!given) {
      return;
    }
    // v6 takes the deprecated `logging: true` as `console.log`
    const logging = (given === true ? console.log : given) as Extract<
      QueryLogSettings['logging'],
      (...args: never[]) => unknown
    >;
    const sql = `Executing (${options.transactionId ?? 'default'}): ${QueryLogger.#inlined(query)}`;
    if (options.benchmark ?? this.#defaults.benchmark) {
      logging(sql.replace('Executing', 'Executed'), elapsed);
    } else {
      // v6 passes the query options here although its typings declare `timing?: number`.
      (logging as (sql: string, options: unknown) => void)(sql, {
        bind: query.values,
        parameterizedSql: query.text,
      });
    }
  }
}
