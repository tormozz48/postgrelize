import { ValidationErrorItem } from '../errors/errors.ts';
import { SqlExpression } from '../expressions/methods.ts';
import type { AttributeDefinition } from '../model/model-definition.ts';
import { AttributeValidators } from './attribute-validators.ts';
import { CoreValidator } from './core-validator.ts';
import { CustomValidators } from './custom-validators.ts';
import type { StandardSchemaV1 } from './standard-schema.ts';
import { SchemaItems } from './schema-items.ts';
import type { ModelValidatorFunction } from './types.ts';
import type { ValidationScope, ValidationTarget } from './validation-target.ts';

export type { ValidationScope, ValidationTarget } from './validation-target.ts';

/**
 * Validates instances like Sequelize v6 `InstanceValidator` (without hooks): `notNull`, string
 * values, built-in (validator.js) and custom attribute validators, Standard Schemas and model
 * validators. Expressions (`literal`, `fn`, ...) are not validated.
 *
 * @internal
 */
export class InstanceValidator {
  readonly #core = new CoreValidator();
  readonly #attributes = new AttributeValidators();
  readonly #schema = new SchemaItems();
  readonly #custom = new CustomValidators();

  /**
   * Validates an instance and returns all failures.
   *
   * @param target - Instance, its definition and values.
   * @param scope - Attributes and model validators to skip.
   * @param modelValidators - Model-level validators (`validate` model option).
   * @param modelSchema - Standard Schema of the whole model (`schema` model option).
   * @returns Failures; empty when the instance is valid.
   */
  async validate(
    target: ValidationTarget,
    scope: ValidationScope,
    modelValidators: Readonly<Record<string, ModelValidatorFunction>> = {},
    modelSchema?: StandardSchemaV1,
  ): Promise<readonly ValidationErrorItem[]> {
    const attributes = this.#checked(target, scope);
    const coreErrors = this.#coreItems(target, attributes);
    const [attributeErrors, modelErrors, schemaIssues] = await Promise.all([
      this.#attributeItems(target, attributes),
      this.#modelValidatorItems(target, modelValidators, scope),
      this.#modelSchemaItems(target, modelSchema),
    ]);
    return [...coreErrors, ...attributeErrors, ...modelErrors, ...schemaIssues];
  }

  #checked(target: ValidationTarget, scope: ValidationScope): readonly AttributeDefinition[] {
    return [...target.definition.attributes.values()].filter(
      (attribute) =>
        !scope.skip.has(attribute.fieldName) &&
        !(target.values[attribute.fieldName] instanceof SqlExpression),
    );
  }

  #coreItems(
    target: ValidationTarget,
    attributes: readonly AttributeDefinition[],
  ): readonly ValidationErrorItem[] {
    return attributes.flatMap((attribute) =>
      this.#core.items(target, attribute, target.values[attribute.fieldName]),
    );
  }

  async #attributeItems(
    target: ValidationTarget,
    attributes: readonly AttributeDefinition[],
  ): Promise<readonly ValidationErrorItem[]> {
    const results = await Promise.all(
      attributes
        .filter((attribute) => this.#attributes.hasValidators(attribute))
        .map((attribute) =>
          this.#attributes.items(target, attribute, target.values[attribute.fieldName]),
        ),
    );
    return results.flat();
  }

  #modelSchemaItems(
    target: ValidationTarget,
    schema: StandardSchemaV1 | undefined,
  ): Promise<readonly ValidationErrorItem[]> {
    return schema === undefined
      ? Promise.resolve([])
      : this.#schema.items(target, schema, this.#plainValues(target), undefined);
  }

  async #modelValidatorItems(
    target: ValidationTarget,
    validators: Readonly<Record<string, ModelValidatorFunction>>,
    scope: ValidationScope,
  ): Promise<readonly ValidationErrorItem[]> {
    const results = await Promise.all(
      Object.entries(validators)
        .filter(([name]) => !scope.skip.has(name))
        .map(([name, fn]) => this.#modelItems(target, name, fn)),
    );
    return results.flat();
  }

  async #modelItems(
    target: ValidationTarget,
    name: string,
    fn: ModelValidatorFunction,
  ): Promise<readonly ValidationErrorItem[]> {
    const message = await this.#custom.failure(target.instance, fn, []);
    return message === undefined
      ? []
      : [new ValidationErrorItem(message, 'Validation error', name, null, target.instance, name)];
  }

  #plainValues(target: ValidationTarget): Readonly<Record<string, unknown>> {
    return Object.fromEntries(
      [...target.definition.attributes.keys()].map((name) => [name, target.values[name]]),
    );
  }
}
