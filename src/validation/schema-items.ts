import { ValidationErrorItem } from '../errors/errors.ts';
import type { StandardSchemaV1 } from './standard-schema.ts';
import { StandardSchemaValidator } from './standard-schema-validator.ts';
import type { ValidationTarget } from './validation-target.ts';

/** Turns the issues of a Standard Schema into validation error items. */
export class SchemaItems {
  readonly #schemas = new StandardSchemaValidator();

  /**
   * @param test - Value to check.
   * @returns Whether `test` is a Standard Schema.
   */
  isSchema(test: unknown): test is StandardSchemaV1 {
    return this.#schemas.isSchema(test);
  }

  /**
   * Validates a value against a schema.
   *
   * @param target - Instance being validated.
   * @param schema - Standard Schema.
   * @param value - Value to validate.
   * @param path - Attribute the schema belongs to; `undefined` for a model schema.
   * @returns One item per schema issue.
   */
  async items(
    target: ValidationTarget,
    schema: StandardSchemaV1,
    value: unknown,
    path: string | undefined,
  ): Promise<readonly ValidationErrorItem[]> {
    return (await this.#schemas.issues(schema, value)).map(
      (issue) =>
        new ValidationErrorItem(
          issue.message,
          'Validation error',
          SchemaItems.#issuePath(path, issue.path),
          value,
          target.instance,
          'schema',
        ),
    );
  }

  static #issuePath(path: string | undefined, issuePath: string | undefined): string | null {
    if (path === undefined) {
      return issuePath ?? null;
    }
    return issuePath === undefined ? path : `${path}.${issuePath}`;
  }
}
