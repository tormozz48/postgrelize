import { format } from 'node:util';
import validator from 'validator';
import { ValidationError, ValidationErrorItem } from '../errors/errors.ts';
import type { DataType } from './abstract-data-type.ts';

type Rule = Readonly<{ valid: (value: unknown) => boolean; noun: string }>;

const isText = (value: unknown): boolean => typeof value === 'string';
// the v6 `isDecimal` extension of validator.js (also accepts an exponent)
const DECIMAL = /^(?:-?(?:[0-9]+))?(?:\.[0-9]*)?(?:[eE][+-]?(?:[0-9]+))?$/;
const integer = (noun: string): Rule => ({ valid: (v) => validator.isInt(String(v)), noun });
const float = (noun: string): Rule => ({ valid: (v) => validator.isFloat(String(v)), noun });
const text: Rule = { valid: isText, noun: 'string' };
const looseText: Rule = {
  valid: (v) => isText(v) || typeof v === 'number',
  noun: 'string',
};
const shaped = (noun: string, test: (value: string) => boolean): Rule => ({
  valid: (v) => typeof v === 'string' && test(v),
  noun,
});

/** Sequelize v6 `DataType.validate` of each type that has one, by type key. */
const RULES: Readonly<Record<string, Rule>> = Object.freeze({
  STRING: looseText,
  CHAR: looseText,
  TEXT: text,
  CITEXT: text,
  TSVECTOR: text,
  TINYINT: integer('tinyint'),
  SMALLINT: integer('smallint'),
  MEDIUMINT: integer('mediumint'),
  INTEGER: integer('integer'),
  BIGINT: integer('bigint'),
  FLOAT: float('float'),
  REAL: float('real'),
  DOUBLE: float('double precision'),
  DECIMAL: { valid: (v) => String(v) !== '' && DECIMAL.test(String(v)), noun: 'decimal' },
  BOOLEAN: { valid: (v) => validator.isBoolean(String(v)), noun: 'boolean' },
  DATE: { valid: (v) => !Number.isNaN(Date.parse(String(v))), noun: 'date' },
  HSTORE: {
    valid: (v) => Object.getPrototypeOf(v) === Object.prototype,
    noun: 'hstore',
  },
  BLOB: { valid: (v) => isText(v) || Buffer.isBuffer(v), noun: 'blob' },
  UUID: shaped('uuid', (v) => validator.isUUID(v)),
  ARRAY: { valid: Array.isArray, noun: 'array' },
  RANGE: { valid: (v) => Array.isArray(v) && v.length === 2, noun: 'range' },
  INET: shaped('INET', (v) => validator.isIP(v)),
  CIDR: shaped('CIDR', (v) => validator.isIPRange(v)),
  MACADDR: shaped('MACADDR', (v) => validator.isMACAddress(v)),
});

/**
 * Type checks of the `typeValidation` Sequelize option: a value bound for an attribute must fit its
 * data type, as the v6 query generator checks it.
 *
 * @internal
 */
export class TypeValidator {
  /**
   * @throws ValidationError with one item (`validatorKey` `'<TYPE> validator'`). Falsy values pass.
   */
  check(type: DataType, path: string, value: unknown): void {
    if (!value) {
      return;
    }
    const message = this.#failure(type, value);
    if (message !== undefined) {
      const item = new ValidationErrorItem(
        message,
        'Validation error',
        path,
        value as never,
        null as never,
        `${type.key} validator`,
      );
      throw new ValidationError(message, [item]);
    }
  }

  #failure(type: DataType, value: unknown): string | undefined {
    if (type.key === 'ENUM') {
      return type.values?.includes(value as string) === true
        ? undefined
        : format('%j is not a valid choice in %j', value, type.values);
    }
    const rule = RULES[type.key];
    const binary = (type as { options?: { binary?: boolean } }).options?.binary === true;
    return rule === undefined || rule.valid(value) || (binary && Buffer.isBuffer(value))
      ? undefined
      : format(`%j is not a valid ${rule.noun}`, value);
  }
}
