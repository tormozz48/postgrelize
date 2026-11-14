/** A path segment of a Standard Schema issue. */
export type StandardSchemaPathSegment = Readonly<{
  /** Key of the segment. */
  key: PropertyKey;
}>;

/** One problem reported by a Standard Schema validator. */
export type StandardSchemaIssue = Readonly<{
  /** Error message. */
  message: string;
  /** Location of the problem inside the validated value. */
  path?: readonly (PropertyKey | StandardSchemaPathSegment)[];
}>;

/** Result of Standard Schema validation. */
export type StandardSchemaResult =
  | Readonly<{
      /** Validated (possibly transformed) value. */
      value: unknown;
      /** Absent on success. */
      issues?: undefined;
    }>
  | Readonly<{
      /** Problems found. */
      issues: readonly StandardSchemaIssue[];
    }>;

/** The `~standard` property of a Standard Schema v1 object. */
export type StandardSchemaProps = Readonly<{
  /** Standard Schema version. */
  version: 1;
  /** Library name, e.g. `'zod'`. */
  vendor: string;
  /** Validates a value. */
  validate: (value: unknown) => StandardSchemaResult | Promise<StandardSchemaResult>;
}>;

/**
 * Any schema implementing [Standard Schema v1](https://standardschema.dev) — zod, valibot, arktype
 * and others. Used by `validate: { schema }` on attributes and `schema` on models.
 */
export type StandardSchemaV1 = Readonly<{
  /** Standard Schema interface. */
  '~standard': StandardSchemaProps;
}>;

/** @internal */
export const isStandardSchema = (value: unknown): value is StandardSchemaV1 =>
  typeof value === 'object' &&
  value !== null &&
  '~standard' in value &&
  typeof (value as StandardSchemaV1)['~standard'].validate === 'function';

const segmentKey = (segment: PropertyKey | StandardSchemaPathSegment): string =>
  String(typeof segment === 'object' ? segment.key : segment);

/** Validates `value` and returns issues with dotted paths (empty when valid). */
export const standardSchemaIssues = async (
  schema: StandardSchemaV1,
  value: unknown,
): Promise<readonly Readonly<{ message: string; path: string | undefined }>[]> => {
  const result = await schema['~standard'].validate(value);
  return (result.issues ?? []).map((issue) => ({
    message: issue.message,
    path:
      issue.path === undefined || issue.path.length === 0
        ? undefined
        : issue.path.map(segmentKey).join('.'),
  }));
};
