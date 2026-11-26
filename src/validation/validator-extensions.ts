import validatorJs from 'validator';
import type { ValidatorFunction } from './builtin-validators.ts';

const regex = (value: string, pattern: unknown, modifiers?: unknown): boolean =>
  (pattern instanceof RegExp
    ? pattern
    : new RegExp(String(pattern), modifiers === undefined ? undefined : String(modifiers))
  ).test(value);

const contains = (value: string, element: unknown): boolean =>
  typeof element === 'string' && element !== '' && value.includes(element);

/** Sequelize v6 additions on top of validator.js (`utils/validator-extras`). */
export const EXTENSIONS: Readonly<Record<string, ValidatorFunction>> = {
  notEmpty: (value) => !/^[\s\t\r\n]*$/.test(value),
  len: (value, min, max) =>
    validatorJs.isLength(value, {
      min: Number(min ?? 0),
      ...(max === undefined ? {} : { max: Number(max) }),
    }),
  isUrl: (value) => validatorJs.isURL(value),
  isIPv6: (value) => validatorJs.isIP(value, 6),
  isIPv4: (value) => validatorJs.isIP(value, 4),
  notIn: (value, values) => !validatorJs.isIn(value, values as string[]),
  regex: (value, pattern, modifiers) => regex(value, pattern, modifiers),
  notRegex: (value, pattern, modifiers) => !regex(value, pattern, modifiers),
  is: (value, pattern, modifiers) => regex(value, pattern, modifiers),
  not: (value, pattern, modifiers) => !regex(value, pattern, modifiers),
  isDecimal: (value) =>
    value !== '' && /^(?:-?(?:[0-9]+))?(?:\.[0-9]*)?(?:[eE][+-]?(?:[0-9]+))?$/.test(value),
  min: (value, limit) => {
    const number = Number.parseFloat(value);
    return Number.isNaN(number) || number >= Number(limit);
  },
  max: (value, limit) => {
    const number = Number.parseFloat(value);
    return Number.isNaN(number) || number <= Number(limit);
  },
  contains,
  notContains: (value, element) => !contains(value, element),
  isNull: (value) => validatorJs.isEmpty(value),
  isDate: (value) => !Number.isNaN(Date.parse(value)),
};
