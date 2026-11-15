import validatorJs from 'validator';

/** Built-in validator: value as a string, then the validator arguments. */
export type ValidatorFunction = (value: string, ...args: readonly unknown[]) => boolean;

const regex = (value: string, pattern: unknown, modifiers?: unknown): boolean =>
  (pattern instanceof RegExp
    ? pattern
    : new RegExp(String(pattern), modifiers === undefined ? undefined : String(modifiers))
  ).test(value);

const contains = (value: string, element: unknown): boolean =>
  typeof element === 'string' && element !== '' && value.includes(element);

const builtin = validatorJs as unknown as Readonly<Record<string, ValidatorFunction>>;

/** Sequelize v6 additions on top of validator.js (`utils/validator-extras`). */
const extensions: Readonly<Record<string, ValidatorFunction>> = {
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

/**
 * Sequelize v6 built-in attribute validators: validator.js functions plus the v6 additions.
 *
 * @internal
 */
export class BuiltinValidators {
  /**
   * Finds a built-in validator by its Sequelize v6 name.
   *
   * @param name - Validator name, e.g. `'isEmail'` or `'len'`.
   * @returns The validator (called with the value as a string and the arguments), or `undefined`.
   */
  find(name: string): ValidatorFunction | undefined {
    return extensions[name] ?? (typeof builtin[name] === 'function' ? builtin[name] : undefined);
  }
}
