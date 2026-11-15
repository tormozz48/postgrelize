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

  /**
   * Logs one executed statement.
   *
   * @param query - Executed query.
   * @param options - Per-query settings overriding the defaults.
   * @param elapsed - Duration in milliseconds.
   */
  log(query: CompiledQuery, options: QueryLogSettings, elapsed: number): void {
    const logging = options.logging ?? this.#defaults.logging;
    if (logging === false || logging === undefined) {
      return;
    }
    const sql = `Executing (${options.transactionId ?? 'default'}): ${query.text}`;
    if (options.benchmark ?? this.#defaults.benchmark) {
      logging(sql.replace('Executing', 'Executed'), elapsed);
    } else {
      logging(sql, { bind: query.values });
    }
  }
}
