import {
  SchemaSynchronizer,
  type DropOptions,
  type SyncOptions,
} from '../../query-interface/schema-synchronizer.ts';
import type { QueryInterface } from '../../query-interface/query-interface.ts';
import { destroyer } from '../model-operations.ts';
import { registry, syncHooks } from '../model-services.ts';
import type { AnyModel, ModelStatic } from '../options.ts';
import type { QueryOptionsBase } from '../runtime.ts';
import type { ModelConstructor } from './model-constructor.ts';

/**
 * Schema statics of `Model`: `sync`, `drop`, `truncate`.
 *
 * @internal
 */
// oxlint-disable-next-line max-lines-per-function, typescript/explicit-module-boundary-types -- a mixin factory's body is its class (each method is still size-checked); its type can only be inferred.
export const ModelSchema = <TBase extends ModelConstructor>(Base: TBase) => {
  return class SchemaCapability extends Base {
    /**
     * Creates the table of this model and its indexes when missing. `force: true` drops it first
     * (with `CASCADE`); `alter` changes an existing table to match the model.
     *
     * @param this - The model class.
     * @param options - `force`, `alter`, `match`, `schema` and query options.
     * @returns The model class.
     * @example
     * ```ts
     * await User.sync({ alter: true });
     * ```
     * @see [Schema guide](/guide/schema)
     */
    static async sync<MS extends ModelStatic<AnyModel>>(
      this: MS,
      options: SyncOptions = {},
    ): Promise<MS> {
      const { definition, runtime } = registry.state(this);
      await syncHooks.around(this, options, () =>
        new SchemaSynchronizer(runtime, runtime.queryInterface()).sync(definition, options),
      );
      return this;
    }

    /**
     * Drops the table of this model and the enum types it owns.
     *
     * @param options - `cascade`, `schema` and query options.
     * @returns Resolves when done.
     * @example
     * ```ts
     * await Task.drop({ cascade: true });
     * ```
     */
    static async drop(options: DropOptions = {}): Promise<void> {
      const { definition, runtime } = registry.state(this);
      await new SchemaSynchronizer(runtime, runtime.queryInterface()).drop(definition, options);
    }

    /**
     * Removes all rows with `TRUNCATE`, without running hooks.
     *
     * @param options - `cascade`, `restartIdentity` and query options.
     * @returns Resolves when done.
     * @example
     * ```ts
     * await Task.truncate({ restartIdentity: true, cascade: true });
     * ```
     */
    static truncate(
      options: QueryOptionsBase & Readonly<{ cascade?: boolean; restartIdentity?: boolean }> = {},
    ): Promise<void> {
      return destroyer.truncate(this, options);
    }

    /** Schema API of the owning `Sequelize` instance (Sequelize v6 `Model.queryInterface`). */
    static get queryInterface(): QueryInterface {
      return registry.state(this).runtime.queryInterface();
    }

    /**
     * Describes the table of this model: its columns, types, nullability and defaults.
     *
     * @param schema - Schema to read; defaults to the model's schema, then `current_schema()`.
     * @param options - Query options.
     * @returns Column descriptions by column name.
     * @example
     * ```ts
     * const columns = await User.describe();
     * ```
     */
    static describe(
      schema?: string,
      options: QueryOptionsBase = {},
    ): ReturnType<QueryInterface['describeTable']> {
      const { definition, runtime } = registry.state(this);
      const target = schema ?? definition.schema;
      return runtime.queryInterface().describeTable(definition.tableName, {
        ...(target === undefined ? {} : { schema: target }),
        ...options,
      });
    }

    /**
     * Drops a schema with `DROP SCHEMA` (shortcut of `queryInterface.dropSchema`, Sequelize v6 `Model.dropSchema`).
     *
     * @param schema - Schema name.
     * @returns Resolves when done.
     * @example
     * ```ts
     * await User.dropSchema('tenant_1');
     * ```
     */
    static dropSchema(schema: string): Promise<void> {
      return registry.state(this).runtime.queryInterface().dropSchema(schema);
    }

    /**
     * Removes an attribute from the model definition, e.g. a column added by an association.
     *
     * @param attribute - Attribute name.
     * @example
     * ```ts
     * User.removeAttribute('legacyFlag');
     * ```
     */
    static removeAttribute(attribute: string): void {
      registry.removeAttribute(this, attribute);
    }

    /**
     * Rebuilds the normalized attribute definitions from the model's `init` input.
     *
     * @example
     * ```ts
     * User.refreshAttributes();
     * ```
     */
    static refreshAttributes(): void {
      registry.refreshAttributes(this);
    }
  };
};
