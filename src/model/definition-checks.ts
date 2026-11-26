import { DataTypes } from '../data-types/data-types.ts';
import type { ModelAttributes } from './attribute-options.ts';

type Declared = Readonly<Record<string, unknown>>;

/**
 * The errors Sequelize v6 raises while a model is defined.
 *
 * @internal
 */
export class DefinitionChecks {
  run(model: string, attributes: ModelAttributes, validators: Declared | undefined): void {
    this.attributes(model, attributes);
    this.validators(model, attributes, validators ?? {});
  }

  /**
   * @throws Error for an unknown data type, an `ARRAY` without element type, a `notNull` validator
   * on a nullable attribute or a second auto increment attribute.
   */
  attributes(model: string, declared: ModelAttributes): void {
    const entries = Object.entries(declared).map(([name, input]) => {
      const options = this.#options(input);
      this.#type(model, name, options);
      return options;
    });
    if (entries.filter((options) => options['autoIncrement'] === true).length > 1) {
      throw new Error('Invalid Instance definition. Only one autoincrement field allowed.');
    }
  }

  /**
   * @throws Error for a model validator named like an attribute or one that is not a function.
   */
  validators(model: string, attributes: ModelAttributes, validators: Declared): void {
    for (const [name, validator] of Object.entries(validators)) {
      if (Object.hasOwn(attributes, name)) {
        throw new Error(
          `A model validator function must not have the same name as a field. Model: ${model}, field/validation name: ${name}`,
        );
      }
      if (typeof validator !== 'function') {
        throw new Error(
          `Members of the validate option must be functions. Model: ${model}, error with validate member ${name}`,
        );
      }
    }
  }

  // a bare data type (function or instance) in its options form
  #options(input: unknown): Declared {
    const isOptions = typeof input === 'object' && input !== null && !('sqlType' in input);
    return isOptions ? (input as Declared) : { type: input };
  }

  #type(model: string, name: string, options: Declared): void {
    if (options['type'] === undefined) {
      throw new Error(`Unrecognized datatype for attribute "${model}.${name}"`);
    }
    if (options['type'] === DataTypes.ARRAY) {
      throw new Error('ARRAY is missing type definition for its values.');
    }
    const validate = options['validate'] as Declared | undefined;
    if (options['allowNull'] !== false && Boolean(validate?.['notNull'])) {
      throw new Error(
        `Invalid definition for "${model}.${name}", "notNull" validator is only allowed with "allowNull:false"`,
      );
    }
  }
}
