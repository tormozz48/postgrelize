import { validator } from './validator.ts';

/** Built-in validator: value as a string, then the validator arguments. */
export type ValidatorFunction = (value: string, ...args: readonly unknown[]) => boolean;

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
    // looked up on the shared object, so validators added with `Validator.extend` are found
    const found = (validator as unknown as Readonly<Record<string, unknown>>)[name];
    return name !== 'extend' && Object.hasOwn(validator, name) && typeof found === 'function'
      ? (found as ValidatorFunction)
      : undefined;
  }
}
