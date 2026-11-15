import { ValidationErrorItem } from '../errors/errors.ts';
import type { AttributeDefinition } from '../model/model-definition.ts';
import { BuiltinValidators } from './builtin-validators.ts';
import type { ValidationTarget } from './validation-target.ts';

const builtinValidators = new BuiltinValidators();

/** Runs one built-in (validator.js) validator option of an attribute. */
export class BuiltinAttributeValidator {
  /**
   * Validates a non-null attribute value.
   *
   * @param target - Instance being validated.
   * @param attribute - Attribute definition.
   * @param name - Validator name, e.g. `isEmail`.
   * @param test - Validator option: `false`, arguments, or `{ args, msg }`.
   * @param value - Current value of the attribute.
   * @returns The failure, or `undefined` when the value passed or the validator is disabled.
   * @throws Error for an unknown validator name.
   */
  run(
    target: ValidationTarget,
    attribute: AttributeDefinition,
    name: string,
    test: unknown,
    value: unknown,
  ): ValidationErrorItem | undefined {
    if (test === false) {
      return undefined;
    }
    const field = attribute.fieldName;
    const normalized = BuiltinAttributeValidator.#normalize(name, test);
    const args = BuiltinAttributeValidator.#args(normalized, name, field, target);
    return BuiltinAttributeValidator.#passes(target, field, name, args, value)
      ? undefined
      : BuiltinAttributeValidator.#failure(target, field, name, normalized, args, value);
  }

  static #failure(
    target: ValidationTarget,
    field: string,
    name: string,
    test: unknown,
    args: readonly unknown[],
    value: unknown,
  ): ValidationErrorItem {
    return new ValidationErrorItem(
      BuiltinAttributeValidator.#message(test) ?? `Validation ${name} on ${field} failed`,
      'Validation error',
      field,
      value,
      target.instance,
      name,
      name,
      args,
    );
  }

  static #passes(
    target: ValidationTarget,
    field: string,
    name: string,
    args: readonly unknown[],
    value: unknown,
  ): boolean {
    if (name === 'isImmutable') {
      return target.isNewRecord || target.values[field] === target.previous[field];
    }
    const fn = builtinValidators.find(name);
    if (fn === undefined) {
      throw new Error(`Invalid validator function: ${name}`);
    }
    return fn(String(value), ...args);
  }

  static #normalize(name: string, test: unknown): unknown {
    if (!['isUrl', 'isURL', 'isEmail'].includes(name)) {
      return test;
    }
    const msg = BuiltinAttributeValidator.#message(test);
    return msg === undefined ? {} : { msg };
  }

  static #message(test: unknown): string | undefined {
    return typeof test === 'object' && test !== null && 'msg' in test
      ? String((test as { msg: unknown }).msg)
      : undefined;
  }

  static #args(
    test: unknown,
    name: string,
    field: string,
    target: ValidationTarget,
  ): readonly unknown[] {
    const raw =
      typeof test === 'object' && test !== null && 'args' in test
        ? (test as { args: unknown }).args
        : test;
    if (Array.isArray(raw)) {
      return raw;
    }
    if (name === 'isImmutable') {
      return [raw, field, target];
    }
    return BuiltinAttributeValidator.#takesNoArgs(raw, name) ? [] : [raw];
  }

  static #takesNoArgs(raw: unknown, name: string): boolean {
    return (
      (typeof raw !== 'string' && ['isAlpha', 'isAlphanumeric', 'isMobilePhone'].includes(name)) ||
      name === 'isIP'
    );
  }
}
