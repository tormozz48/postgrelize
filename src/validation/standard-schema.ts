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
