import { ValidationErrorItem } from '../errors/errors.ts';
import type { AttributeDefinition } from '../model/model-definition.ts';
import { BuiltinAttributeValidator } from './builtin-attribute-validator.ts';
import { CustomValidators } from './custom-validators.ts';
import { SchemaItems } from './schema-items.ts';
import type { AttributeValidateOptions, AttributeValidatorFunction } from './types.ts';
import type { ValidationTarget } from './validation-target.ts';

/** Runs the `validate` options of one attribute: built-in, custom and Standard Schema validators. */
export class AttributeValidators {
  readonly #builtin = new BuiltinAttributeValidator();
  readonly #custom = new CustomValidators();
  readonly #schema = new SchemaItems();

  /**
   * Validates one attribute value (`notNull` is checked elsewhere).
   *
   * @param target - Instance being validated.
   * @param attribute - Attribute definition.
   * @param value - Current value of the attribute.
   * @returns Failures of all validators of the attribute.
   */
  async items(
    target: ValidationTarget,
    attribute: AttributeDefinition,
    value: unknown,
  ): Promise<readonly ValidationErrorItem[]> {
    if ((value === null || value === undefined) && attribute.allowNull === false) {
      return [];
    }
    const validate = (attribute.validate ?? {}) as AttributeValidateOptions;
    const results = await Promise.all(
      Object.entries(validate)
        .filter(([name]) => name !== 'notNull')
        .map(([name, test]) => this.#validatorItems(target, attribute, name, test, value)),
    );
    return results.flat();
  }

  async #validatorItems(
    target: ValidationTarget,
    attribute: AttributeDefinition,
    name: string,
    test: unknown,
    value: unknown,
  ): Promise<readonly ValidationErrorItem[]> {
    if (name === 'schema' && this.#schema.isSchema(test)) {
      return value === undefined
        ? []
        : this.#schema.items(target, test, value, attribute.fieldName);
    }
    if (typeof test === 'function') {
      return this.#customItems(
        target,
        attribute.fieldName,
        name,
        test as AttributeValidatorFunction,
        value,
      );
    }
    return this.#builtinItems(target, attribute, name, test, value);
  }

  async #customItems(
    target: ValidationTarget,
    path: string,
    name: string,
    fn: AttributeValidatorFunction,
    value: unknown,
  ): Promise<readonly ValidationErrorItem[]> {
    const message = await this.#custom.failure(target.instance, fn, [value]);
    const { instance } = target;
    return message === undefined
      ? []
      : [new ValidationErrorItem(message, 'Validation error', path, value, instance, name)];
  }

  #builtinItems(
    target: ValidationTarget,
    attribute: AttributeDefinition,
    name: string,
    test: unknown,
    value: unknown,
  ): readonly ValidationErrorItem[] {
    if (value === null || value === undefined) {
      return [];
    }
    const item = this.#builtin.run(target, attribute, name, test, value);
    return item === undefined ? [] : [item];
  }
}
