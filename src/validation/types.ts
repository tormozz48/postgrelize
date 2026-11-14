import type { StandardSchemaV1 } from './standard-schema.ts';

/** Custom attribute validator; throw (or reject) to fail. Called with the instance as `this`. */
export type AttributeValidatorFunction = (value: unknown) => unknown;

/** Built-in validator setting: `true`, arguments, or `{ args, msg }`. */
export type BuiltinValidatorOption = boolean | unknown | Readonly<{ args?: unknown; msg?: string }>;

/**
 * Attribute `validate` option: Sequelize v6 built-in validators (validator.js names plus `is`, `not`,
 * `len`, `notEmpty`, `min`, `max`, ...), custom functions, and `schema` — any Standard Schema
 * (zod, valibot, arktype; PostgreSQL-independent extension).
 */
export type AttributeValidateOptions = Readonly<
  Record<string, BuiltinValidatorOption | AttributeValidatorFunction> & {
    /** Standard Schema the value must satisfy. */
    schema?: StandardSchemaV1;
    /** Custom message for `allowNull: false` violations. */
    notNull?: boolean | Readonly<{ msg?: string }>;
  }
>;

/** Model-level validator (`validate` model option); throw to fail. Called with the instance as `this`. */
export type ModelValidatorFunction = () => unknown;
