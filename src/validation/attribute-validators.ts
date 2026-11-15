import { ValidationErrorItem } from '../errors/errors.ts';
import type { AttributeDefinition } from '../model/model-definition.ts';
import { BuiltinAttributeValidator } from './builtin-attribute-validator.ts';
import { CustomValidators } from './custom-validators.ts';
import { SchemaItems } from './schema-items.ts';
import type { StandardSchemaV1 } from './standard-schema.ts';
import type { AttributeValidateOptions } from './types.ts';
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
      return this.#schemaItems(target, attribute.fieldName, test, value);
    }
    if (typeof test === 'function') {
      return this.#customItems(target, attribute, name, test, value);
    }
    return this.#builtinItems(target, attribute, name, test, value);
  }

  #schemaItems(
    target: ValidationTarget,
    path: string,
    schema: StandardSchemaV1,
    value: unknown,
  ): Promise<readonly ValidationErrorItem[]> {
    return value === undefined
      ? Promise.resolve([])
      : this.#schema.items(target, schema, value, path);
  }

  async #customItems(
    target: ValidationTarget,
    attribute: AttributeDefinition,
    name: string,
    fn: unknown,
    value: unknown,
  ): Promise<readonly ValidationErrorItem[]> {
    const message = await this.#custom.failure(target.instance, fn, [value]);
    const { instance } = target;
    const { fieldName } = attribute;
    return message === undefined
      ? []
      : [new ValidationErrorItem(message, 'Validation error', fieldName, value, instance, name)];
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
