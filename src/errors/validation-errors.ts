import { BaseError, type DriverError } from './base-error.ts';
import type { ConstraintErrorOptions } from './database-errors.ts';

/** Origin of a validation error item. */
export type ValidationErrorItemOrigin = 'CORE' | 'DB' | 'FUNCTION';

/** Shape of {@link ValidationErrorItemOrigin}. */
export interface ValidationErrorItemOrigins {
  /** Raised by a built-in check such as not-null. */
  readonly CORE: 'CORE';
  /** Raised by the database, e.g. a unique violation. */
  readonly DB: 'DB';
  /** Raised by a custom validator function. */
  readonly FUNCTION: 'FUNCTION';
}

/** Shape of {@link ValidationErrorItemType}. */
export interface ValidationErrorItemTypes {
  /** A not-null violation is a `CORE` error. */
  readonly 'notnull violation': 'CORE';
  /** A string violation is a `CORE` error. */
  readonly 'string violation': 'CORE';
  /** A unique violation is a `DB` error. */
  readonly 'unique violation': 'DB';
  /** A failed validator is a `FUNCTION` error. */
  readonly 'validation error': 'FUNCTION';
}

/** Values of {@link ValidationErrorItem.origin}, as in Sequelize v6. */
export const ValidationErrorItemOrigin: ValidationErrorItemOrigins = Object.freeze({
  CORE: 'CORE',
  DB: 'DB',
  FUNCTION: 'FUNCTION',
});

/** Origin by validation error type, as in Sequelize v6 (`ValidationErrorItemType['unique violation']` is `'DB'`). */
export const ValidationErrorItemType: ValidationErrorItemTypes = Object.freeze({
  'notnull violation': 'CORE',
  'string violation': 'CORE',
  'unique violation': 'DB',
  'validation error': 'FUNCTION',
});

const ORIGIN_BY_TYPE: Readonly<Record<string, ValidationErrorItemOrigin>> = {
  'notnull violation': 'CORE',
  'string violation': 'CORE',
  'unique violation': 'DB',
  'validation error': 'FUNCTION',
};

const ORIGINS: ReadonlySet<string> = new Set(['CORE', 'DB', 'FUNCTION']);

const classify = (
  type: string | null | undefined,
): Readonly<{ origin: ValidationErrorItemOrigin | null; type: string | null }> => {
  const origin =
    type === undefined || type === null ? undefined : ORIGIN_BY_TYPE[type.toLowerCase().trim()];
  return {
    origin:
      type !== undefined && type !== null && ORIGINS.has(type)
        ? (type as ValidationErrorItemOrigin)
        : (origin ?? null),
    type: origin === undefined ? null : (type ?? null),
  };
};

/**
 * Describes a single failed validation: which attribute, which value and which validator (Sequelize v6 `ValidationErrorItem`).
 *
 * `origin` is derived from `type`: `'CORE'` for not-null and string violations, `'DB'` for unique violations, `'FUNCTION'` for custom validators.
 *
 * @example
 * ```ts
 * try {
 *   await User.create({ email: 'not-an-email' });
 * } catch (e) {
 *   if (e instanceof ValidationError) {
 *     for (const item of e.errors) {
 *       console.error(item.path, item.validatorKey, item.value, item.origin);
 *     }
 *   }
 * }
 * ```
 */
export class ValidationErrorItem {
  /** Human-readable message. */
  readonly message: string;
  /** Validation type, e.g. `'unique violation'`, `'notNull Violation'`, `'Validation error'`. */
  declare readonly type: string | null;
  /** Attribute name (or model validator name). */
  readonly path: string | null;
  /** Offending value. */
  readonly value: unknown;
  /** Where the error was raised, derived from `type`. */
  declare readonly origin: ValidationErrorItemOrigin | null;
  /** Instance being validated. */
  readonly instance: object | null;
  /** Validator key, e.g. `'not_unique'`, `'is_null'`, `'isEmail'`. */
  readonly validatorKey: string | null;
  /** Built-in validator name. */
  readonly validatorName: string | null;
  /** Built-in validator arguments. */
  readonly validatorArgs: readonly unknown[];
  /**
   * Values of `origin` (Sequelize v6 `ValidationErrorItem.Origins`).
   */
  static readonly Origins: Readonly<{
    /** Raised by a built-in check of the library. */
    CORE: 'CORE';
    /** Raised by the database. */
    DB: 'DB';
    /** Raised by a validator function. */
    FUNCTION: 'FUNCTION';
  }> = Object.freeze({ CORE: 'CORE', DB: 'DB', FUNCTION: 'FUNCTION' });

  /** What a custom validator threw (v6 `original`); set only on items of failed custom validators. */
  original?: unknown;

  /**
   * Creates an item; `path`, `instance`, `validatorKey` and `validatorName` default to `null`, `validatorArgs` to `[]`, and `value` to `null` when `undefined`.
   *
   * @param message - Human-readable message.
   * @param type - Validation type or origin.
   * @param path - Attribute name.
   * @param value - Offending value.
   * @param instance - Instance being validated.
   * @param validatorKey - Validator key.
   * @param validatorName - Built-in validator name.
   * @param validatorArgs - Built-in validator arguments.
   */
  constructor(
    message: string,
    type?: string | null,
    path?: string | null,
    value?: unknown,
    instance?: object | null,
    validatorKey?: string | null,
    validatorName?: string | null,
    validatorArgs?: readonly unknown[],
  ) {
    this.message = message;
    this.path = path ?? null;
    this.value = value === undefined ? null : value;
    this.instance = instance ?? null;
    this.validatorKey = validatorKey ?? null;
    this.validatorName = validatorName ?? null;
    this.validatorArgs = validatorArgs ?? [];
    Object.assign(this, classify(type));
  }

  /**
   * Lower-case validator key (else validator name), prefixed with the origin, like Sequelize v6.
   *
   * @param useTypeAsNS - Prefix the origin. Default true.
   * @param separator - Text between origin and key. Default `'.'`.
   * @returns The key, e.g. `'db.not_unique'`.
   * @throws Error when `separator` is empty or not a string and a prefix is wanted.
   * @example
   * ```ts
   * const item = new ValidationErrorItem('taken', 'unique violation', 'name', 'a', null, 'not_unique');
   * item.getValidatorKey(); // 'db.not_unique'
   * ```
   */
  getValidatorKey(useTypeAsNS = true, separator = '.'): string {
    // like v6: only a known origin is a namespace, and an item without a key gives ''
    const namespace = useTypeAsNS && this.origin && ORIGINS.has(this.origin) ? this.origin : null;
    if (namespace && (typeof separator !== 'string' || separator === '')) {
      throw new Error('Invalid namespace separator given, must be a non-empty string');
    }
    const key = this.validatorKey || this.validatorName;
    if (typeof key !== 'string' || key === '') {
      return '';
    }
    return (namespace ? [namespace, key].join(separator) : key).toLowerCase().trim();
  }

  /**
   * Records what a custom validator threw as {@link ValidationErrorItem.original}.
   *
   * @internal
   * @param original - The thrown value.
   * @returns This item.
   */
  withOriginal(original: unknown): this {
    this.original = original;
    return this;
  }
}

/**
 * Thrown when a model instance fails validation, carrying one item per failed rule (Sequelize v6 `ValidationError`).
 *
 * Raised by `create`, `save`, `update`, `build(...).validate()` and similar before any SQL is sent. Not-null, unique and validator failures all end up in `errors`.
 *
 * @example
 * ```ts
 * try {
 *   await User.create({ email: 'not-an-email' });
 * } catch (e) {
 *   if (e instanceof ValidationError) {
 *     console.error(e.errors.map((item) => `${item.path}: ${item.message}`));
 *   }
 * }
 * ```
 */
export class ValidationError extends BaseError {
  /** Individual validation failures. */
  readonly errors: readonly ValidationErrorItem[];

  /**
   * Creates the error from a message and its items.
   *
   * @param message - Error message; when empty it is built from the items like Sequelize v6.
   * @param errors - Individual validation failures.
   */
  constructor(message: string | null | undefined, errors: readonly ValidationErrorItem[] = []) {
    super(
      message !== null && message !== undefined && message !== ''
        ? message
        : errors.length > 0
          ? errors.map((item) => `${item.type ?? item.origin ?? ''}: ${item.message}`).join(',\n')
          : 'Validation Error',
    );
    this.name = 'SequelizeValidationError';
    this.errors = errors;
  }

  /**
   * Returns the validation items reported for one attribute.
   *
   * @param path - Attribute name, compared with each item's `path`.
   * @returns Items whose `path` equals `path`; an empty array when there are none.
   *
   * @example
   * ```ts
   * try {
   *   await User.create({});
   * } catch (e) {
   *   if (e instanceof ValidationError) {
   *     console.error(e.get('email').map((item) => item.message));
   *   }
   * }
   * ```
   */
  get(path: string): ValidationErrorItem[] {
    return this.errors.filter((item) => item.path === path);
  }
}

/**
 * Thrown when PostgreSQL reports a unique violation (SQLSTATE `23505`); a {@link ValidationError} subclass like in Sequelize v6.
 *
 * `fields` maps the unique columns to the offending values (parsed from the PostgreSQL detail) and `errors` has one `not_unique` item per column.
 *
 * @example
 * ```ts
 * try {
 *   await User.create({ email: 'taken@example.com' });
 * } catch (e) {
 *   if (e instanceof UniqueConstraintError) {
 *     console.error(e.fields, e.errors[0]?.message);
 *   }
 * }
 * ```
 */
export class UniqueConstraintError extends ValidationError {
  /** Original driver error. */
  readonly parent: DriverError;
  /** Original driver error (alias of `parent`). */
  readonly original: DriverError;
  /** Executed SQL text. */
  readonly sql: string;
  /** Unique columns mapped to offending values. */
  readonly fields: Readonly<Record<string, string>>;

  /**
   * Builds the error; the message defaults to `Validation error`.
   *
   * @param options - Driver error, fields and validation items.
   */
  constructor(
    options: Omit<ConstraintErrorOptions, 'fields'> &
      Readonly<{
        fields?: Readonly<Record<string, string>>;
        errors?: readonly ValidationErrorItem[];
      }> = {},
  ) {
    super(options.message ?? 'Validation error', options.errors);
    this.name = 'SequelizeUniqueConstraintError';
    const parent = options.parent ?? Object.assign(new Error(''), { sql: '' });
    this.parent = parent;
    this.original = parent;
    this.sql = options.sql ?? '';
    this.fields = options.fields ?? {};
  }
}
