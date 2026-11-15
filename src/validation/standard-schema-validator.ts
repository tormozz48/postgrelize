import type { StandardSchemaPathSegment, StandardSchemaV1 } from './standard-schema.ts';

/** Problem found by a Standard Schema, with a dotted path. */
export type StandardSchemaFailure = Readonly<{ message: string; path: string | undefined }>;

/**
 * Validates values with [Standard Schema v1](https://standardschema.dev) schemas (zod, valibot,
 * arktype, ...).
 *
 * @internal
 */
export class StandardSchemaValidator {
  /**
   * Checks whether a value is a Standard Schema.
   *
   * @param value - Value to test.
   * @returns True when `value` has a `~standard.validate` function.
   */
  isSchema(value: unknown): value is StandardSchemaV1 {
    return (
      typeof value === 'object' &&
      value !== null &&
      '~standard' in value &&
      typeof (value as StandardSchemaV1)['~standard'].validate === 'function'
    );
  }

  /**
   * Validates a value.
   *
   * @param schema - Schema to validate against.
   * @param value - Value to validate.
   * @returns Issues with dotted paths (empty when valid).
   */
  async issues(
    schema: StandardSchemaV1,
    value: unknown,
  ): Promise<readonly StandardSchemaFailure[]> {
    const result = await schema['~standard'].validate(value);
    return (result.issues ?? []).map((issue) => ({
      message: issue.message,
      path:
        issue.path === undefined || issue.path.length === 0
          ? undefined
          : issue.path.map((segment) => this.#segmentKey(segment)).join('.'),
    }));
  }

  #segmentKey(segment: PropertyKey | StandardSchemaPathSegment): string {
    return String(typeof segment === 'object' ? segment.key : segment);
  }
}
