/**
 * One entry of `RetryOptions.match`, compared with the error that made an attempt fail (as in
 * `retry-as-promised`, which Sequelize v6 uses): a string equal to `error.message` or `String(error)`,
 * a regular expression that matches either of them, an error class (`error instanceof match`), or a
 * predicate `(error) => boolean`.
 */
export type RetryMatch =
  | string
  | RegExp
  | (abstract new (...args: never[]) => unknown)
  | ((error: unknown) => unknown);

/**
 * Retry settings (Sequelize v6 `RetryOptions`), given as the `retry` option of {@link SequelizeOptions}
 * and of a single query or transaction (the query option is merged over the instance option).
 * Nothing is retried unless `max` is set. An attempt is repeated only when it failed, fewer than `max`
 * attempts ran and, when `match` is non-empty, the error matches an entry. Connection errors are
 * matchable by the v6 names `SequelizeConnectionError`, `SequelizeConnectionRefusedError`,
 * `SequelizeHostNotFoundError`, `SequelizeHostNotReachableError`, `SequelizeInvalidConnectionError`
 * and `SequelizeConnectionTimedOutError`.
 *
 * @example
 * ```ts
 * const retry: RetryOptions = {
 *   max: 5,
 *   match: [/SequelizeConnectionRefusedError/, 'ECONNRESET'],
 *   backoffBase: 100,
 *   backoffExponent: 1.1,
 * };
 * const db = new Sequelize('postgres://user:pass@localhost:5432/app', { retry });
 * ```
 */
export type RetryOptions = Readonly<{
  /** Maximum number of attempts, the first one included. Without it nothing is retried. */
  max?: number;
  /**
   * Errors worth retrying. An empty or missing list retries every error, so list the errors you
   * mean (for example `[/SequelizeConnectionError/]`).
   */
  match?: readonly RetryMatch[];
  /** Delay before the first retry in milliseconds. Default 100. */
  backoffBase?: number;
  /** Growth of the delay per retry: `backoffBase * backoffExponent ** (attempt - 1)`. Default 1.1. */
  backoffExponent?: number;
  /** Random variation added to or subtracted from each delay, in milliseconds. Default 0. */
  backoffJitter?: number;
  /** Rejects an attempt that takes longer than this many milliseconds, without retrying it. */
  timeout?: number;
  /** Name used in messages and in the timeout error. Default `'unknown'`. */
  name?: string;
  /** Receives progress messages. */
  report?: (message: string, options: RetryOptions, error?: unknown) => void;
}>;

/** Thrown when an attempt exceeds `RetryOptions.timeout`; `previous` is the error of the attempt before. */
class RetryTimeoutError extends Error {
  readonly previous: unknown;

  constructor(message: string, previous: unknown) {
    super(message);
    this.name = 'TimeoutError';
    this.previous = previous;
  }
}

const DEFAULT_BACKOFF_BASE = 100;
const DEFAULT_BACKOFF_EXPONENT = 1.1;

/**
 * Runs a task again when it fails, mirroring `retry-as-promised` as Sequelize v6 uses it: same
 * matching rules, backoff and defaults. Holds the instance-wide `retry` option and merges the
 * per-call option over it (a shallow merge, as in v6).
 */
export class RetryRunner {
  readonly #defaults: RetryOptions | undefined;

  /**
   * @param defaults - The `retry` option of the `Sequelize` instance.
   */
  constructor(defaults: RetryOptions | undefined) {
    this.#defaults = defaults;
  }

  /**
   * Whether a call with this per-call option can be affected by retry settings.
   *
   * @param options - Per-call `retry` option.
   * @returns False when neither the instance nor the call configured retries.
   */
  active(options: RetryOptions | undefined): boolean {
    return this.#defaults !== undefined || options !== undefined;
  }

  /**
   * Runs `task`, repeating it while the merged settings allow.
   *
   * @param task - Work to run; it must be safe to run again after a failure.
   * @param options - Per-call `retry` option, merged over the instance option.
   * @returns Result of the first attempt that succeeds.
   * @throws The error of the last attempt, or a `TimeoutError` when an attempt exceeds `timeout`.
   */
  run<T>(task: () => Promise<T>, options?: RetryOptions): Promise<T> {
    return this.active(options)
      ? this.#attempt(task, { ...this.#defaults, ...options }, 1, undefined)
      : task();
  }

  async #attempt<T>(
    task: () => Promise<T>,
    settings: RetryOptions,
    current: number,
    previous: unknown,
  ): Promise<T> {
    settings.report?.(`Trying ${RetryRunner.#name(settings)} #${current}`, settings);
    try {
      return await RetryRunner.#withTimeout(task(), settings, previous);
    } catch (error) {
      if (!RetryRunner.#shouldRetry(error, settings, current)) {
        throw error;
      }
      settings.report?.(String(error), settings, error);
      await RetryRunner.#sleep(RetryRunner.#delay(settings, current));
      return this.#attempt(task, settings, current + 1, error);
    }
  }

  static #name(settings: RetryOptions): string {
    return settings.name === undefined || settings.name === '' ? 'unknown' : settings.name;
  }

  static #withTimeout<T>(work: Promise<T>, settings: RetryOptions, previous: unknown): Promise<T> {
    if (settings.timeout === undefined || settings.timeout === 0) {
      return work;
    }
    let timer: NodeJS.Timeout | undefined;
    const expired = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new RetryTimeoutError(`${RetryRunner.#name(settings)} timed out`, previous)),
        settings.timeout,
      );
    });
    return Promise.race([work, expired]).finally(() => clearTimeout(timer));
  }

  static #shouldRetry(error: unknown, settings: RetryOptions, current: number): boolean {
    if (
      error instanceof RetryTimeoutError ||
      settings.max === undefined ||
      current >= settings.max
    ) {
      return false;
    }
    const match = settings.match ?? [];
    return match.length === 0 || match.some((entry) => RetryRunner.#matches(entry, error));
  }

  // Same order as retry-as-promised: a function is tried as a class first and, when `instanceof`
  // rejects it (an arrow function has no prototype), called as a predicate.
  static #matches(match: RetryMatch, error: unknown): boolean {
    if (typeof match === 'function') {
      try {
        if (error instanceof (match as abstract new () => unknown)) {
          return true;
        }
      } catch {
        return Boolean((match as (error: unknown) => unknown)(error));
      }
    }
    const text = String(error);
    const message = (error as { message?: unknown } | null | undefined)?.message;
    return (
      match === text ||
      match === message ||
      (match instanceof RegExp && (match.test(String(message)) || match.test(text)))
    );
  }

  static #delay(settings: RetryOptions, current: number): number {
    const base = settings.backoffBase ?? DEFAULT_BACKOFF_BASE;
    const exponent = settings.backoffExponent || DEFAULT_BACKOFF_EXPONENT;
    const jitter = settings.backoffJitter ?? 0;
    const delay = base * exponent ** (current - 1);
    return Math.max(0, delay + Math.random() * jitter * (Math.random() > 0.5 ? 1 : -1));
  }

  static #sleep(milliseconds: number): Promise<void> {
    return milliseconds > 0
      ? new Promise((resolve) => setTimeout(resolve, milliseconds))
      : Promise.resolve();
  }
}
