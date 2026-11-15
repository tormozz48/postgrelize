import {
  SchemaSynchronizer,
  type DropOptions,
  type SyncOptions,
} from '../../query-interface/schema-synchronizer.ts';
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
  };
};
