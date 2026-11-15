import { ModelRegistry } from '../model/model-registry.ts';
import { syncHooks } from '../model/model-services.ts';
import type { QueryOptionsBase } from '../model/runtime.ts';
import {
  SchemaSynchronizer,
  type DropOptions,
  type SyncOptions,
} from '../query-interface/schema-synchronizer.ts';
import type { SequelizeBase } from './sequelize-base.ts';
import type { SequelizeConstructor } from './sequelize-constructor.ts';

const registry = new ModelRegistry();

const synchronizer = (sequelize: SequelizeBase): SchemaSynchronizer =>
  new SchemaSynchronizer(sequelize.internals.runtime, sequelize.getQueryInterface());

const definitions = (sequelize: SequelizeBase): ReturnType<ModelRegistry['definition']>[] =>
  Object.values(sequelize.models).map((model) => registry.definition(model));

const runSync = async (sequelize: SequelizeBase, options: SyncOptions): Promise<void> => {
  const hooks = options.hooks !== false;
  const hookOptions = { ...options, hooks };
  if (hooks) {
    await sequelize.internals.hooks.run('beforeBulkSync', sequelize, hookOptions);
  }
  const models = new Map(Object.values(sequelize.models).map((m) => [registry.definition(m), m]));
  await synchronizer(sequelize).syncAll(definitions(sequelize), options, (definition, run) =>
    syncHooks.around(models.get(definition) ?? {}, hookOptions, run),
  );
  if (hooks) {
    await sequelize.internals.hooks.run('afterBulkSync', sequelize, hookOptions);
  }
};

/**
 * Schema methods of `Sequelize`: schema management, `sync` and `drop`.
 *
 * @internal
 */
// oxlint-disable-next-line max-lines-per-function, typescript/explicit-module-boundary-types -- a mixin factory's body is its class (each method is still size-checked); its type can only be inferred.
export const SequelizeSchema = <TBase extends SequelizeConstructor>(Base: TBase) =>
  class SchemaCapability extends Base {
    /**
     * Creates a schema if it does not exist.
     *
     * @param schema - Schema name.
     * @param options - Query options.
     */
    async createSchema(schema: string, options?: QueryOptionsBase): Promise<void> {
      await this.getQueryInterface().createSchema(schema, options);
    }

    /**
     * Lists user schemas (without `public`, `information_schema` and `pg_*`).
     *
     * @param options - Query options.
     * @returns Schema names.
     */
    async showAllSchemas(options?: QueryOptionsBase): Promise<string[]> {
      return await this.getQueryInterface().showAllSchemas(options);
    }

    /**
     * Drops a schema with everything in it.
     *
     * @param schema - Schema name.
     * @param options - Query options.
     */
    async dropSchema(schema: string, options?: QueryOptionsBase): Promise<void> {
      await this.getQueryInterface().dropSchema(schema, options);
    }

    /**
     * Drops every user schema with everything in it.
     *
     * @param options - Query options.
     */
    async dropAllSchemas(options?: QueryOptionsBase): Promise<void> {
      await this.getQueryInterface().dropAllSchemas(options);
    }

    /**
     * Creates (or alters / re-creates) the tables of all defined models in foreign-key order.
     *
     * @param options - `force`, `alter`, `match` and query options.
     * @returns This instance.
     */
    async sync(options: SyncOptions = {}): Promise<this> {
      if (options.match !== undefined && !options.match.test(this.config.database ?? '')) {
        throw new Error(
          `Database "${this.config.database ?? ''}" does not match sync match parameter "${String(options.match)}"`,
        );
      }
      await runSync(this, options);
      return this;
    }

    /**
     * Drops the tables of all defined models in reverse foreign-key order.
     *
     * @param options - `cascade` and query options.
     * @returns Resolves when done.
     */
    async drop(options: DropOptions = {}): Promise<void> {
      await synchronizer(this).dropAll(definitions(this), options);
    }
  };
