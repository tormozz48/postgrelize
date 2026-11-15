import { BaseError, type DriverError } from './base-error.ts';
import type { ConstraintErrorOptions } from './database-errors.ts';

/** Origin of a validation error item. */
export type ValidationErrorItemOrigin = 'CORE' | 'DB' | 'FUNCTION';

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

/** One failed validation (Sequelize v6 `ValidationErrorItem`). */
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
}

/** Validation failure with one or more items (Sequelize v6 `ValidationError`). */
export class ValidationError extends BaseError {
  /** Individual validation failures. */
  readonly errors: readonly ValidationErrorItem[];

  /**
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
}

/** Unique constraint violation (`23505`), Sequelize v6 `UniqueConstraintError`. */
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
   * @param options - Driver error, fields and validation items.
   */
  constructor(
    options: Omit<ConstraintErrorOptions, 'fields'> &
      Readonly<{
        fields?: Readonly<Record<string, string>>;
        errors?: readonly ValidationErrorItem[];
      }>,
  ) {
    super(options.message ?? 'Validation error', options.errors);
    this.name = 'SequelizeUniqueConstraintError';
    this.parent = options.parent;
    this.original = options.parent;
    this.sql = options.sql ?? '';
    this.fields = options.fields ?? {};
  }
}
