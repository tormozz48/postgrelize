import { decorate } from './decorator-factory.ts';
import type { ModelPropertyDecorator } from './decorator-types.ts';

/**
 * Names the attribute that holds the creation time (`createdAt: '<attribute>'`).
 *
 * @example
 * ```ts
 * @CreatedAt creationDate!: Date;
 * ```
 */
export const CreatedAt: ModelPropertyDecorator = decorate.forProperty((meta, key) => {
  meta.timestamps.createdAt = key;
});

/**
 * Names the attribute that holds the last update time (`updatedAt: '<attribute>'`).
 *
 * @example
 * ```ts
 * @UpdatedAt updatedOn!: Date;
 * ```
 */
export const UpdatedAt: ModelPropertyDecorator = decorate.forProperty((meta, key) => {
  meta.timestamps.updatedAt = key;
});

/**
 * Names the attribute that holds the deletion time (`deletedAt: '<attribute>'`) and makes the
 * model paranoid unless `@Table` sets `paranoid` explicitly.
 *
 * @example
 * ```ts
 * @DeletedAt removedAt!: Date | null;
 * ```
 */
export const DeletedAt: ModelPropertyDecorator = decorate.forProperty((meta, key) => {
  meta.timestamps.deletedAt = key;
});
