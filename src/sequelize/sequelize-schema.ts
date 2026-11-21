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

const CYCLIC_TRUNCATE =
  'Sequelize#truncate: Some of your models have cyclic references (foreign keys). You need to use the "cascade" option to be able to delete rows from models that have cyclic references.';

type TruncateOptions = QueryOptionsBase &
  Readonly<{ cascade?: boolean; restartIdentity?: boolean }>;

const truncations = (
  sequelize: SequelizeBase,
  ordered: readonly ReturnType<ModelRegistry['definition']>[],
  options: TruncateOptions,
): (() => Promise<void>)[] => {
  const byDefinition = new Map(
    Object.values(sequelize.models).map((model) => [registry.definition(model), model]),
  );
  return ordered.map(
    (definition) => () =>
      (
        byDefinition.get(definition) as unknown as {
          truncate: (o: TruncateOptions) => Promise<void>;
        }
      ).truncate(options),
  );
};

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
     * Runs `CREATE SCHEMA IF NOT EXISTS` for a schema.
     *
     * @param schema - Schema name.
     * @param options - Query options.
     *
     * @example
     * ```ts
     * await sequelize.createSchema('tenant_1');
     * ```
     */
    async createSchema(schema: string, options?: QueryOptionsBase): Promise<void> {
      await this.getQueryInterface().createSchema(schema, options);
    }

    /**
     * Lists the schemas that belong to the application (without `public`, `information_schema` and `pg_*`).
     *
     * @param options - Query options.
     * @returns Schema names.
     *
     * @example
     * ```ts
     * const schemas = await sequelize.showAllSchemas(); // e.g. ['tenant_1']
     * ```
     */
    async showAllSchemas(options?: QueryOptionsBase): Promise<string[]> {
      return await this.getQueryInterface().showAllSchemas(options);
    }

    /**
     * Runs `DROP SCHEMA IF EXISTS ... CASCADE`, removing the schema and every object in it.
     *
     * @param schema - Schema name.
     * @param options - Query options.
     *
     * @example
     * ```ts
     * await sequelize.dropSchema('tenant_1');
     * ```
     */
    async dropSchema(schema: string, options?: QueryOptionsBase): Promise<void> {
      await this.getQueryInterface().dropSchema(schema, options);
    }

    /**
     * Drops every schema returned by {@link Sequelize.showAllSchemas} with `CASCADE`. Destructive.
     *
     * @param options - Query options.
     *
     * @example
     * ```ts
     * await sequelize.dropAllSchemas();
     * ```
     */
    async dropAllSchemas(options?: QueryOptionsBase): Promise<void> {
      await this.getQueryInterface().dropAllSchemas(options);
    }

    /**
     * Creates (or alters / re-creates) the tables of all defined models in foreign-key order. Reference cycles use deferred foreign keys.
     *
     * @param options - `force`, `alter`, `match` and query options.
     * @returns This instance.
     * @throws Error when `options.match` does not match the database name.
     * @see {@link Model.sync}
     *
     * @example
     * ```ts
     * await sequelize.sync({ alter: { drop: false } });
     * await sequelize.sync({ force: true, match: /_test$/ });
     * ```
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
     * Drops the tables of all defined models in reverse foreign-key order. Destructive.
     *
     * @param options - `cascade` and query options.
     * @returns Resolves when done.
     *
     * @example
     * ```ts
     * await sequelize.drop({ cascade: true });
     * ```
     */
    async drop(options: DropOptions = {}): Promise<void> {
      await synchronizer(this).dropAll(definitions(this), options);
    }

    /**
     * Empties the tables of all defined models (`TRUNCATE`), tables that reference others first. With
     * `cascade` the tables are truncated one after the other, otherwise all at once. Destructive.
     *
     * @param options - `cascade`, `restartIdentity` and query options.
     * @returns Resolves when done.
     * @throws Error when foreign keys form a cycle and `cascade` is not set.
     *
     * @example
     * ```ts
     * await sequelize.truncate({ cascade: true });
     * ```
     */
    async truncate(options: TruncateOptions = {}): Promise<void> {
      const { models, cyclic } = synchronizer(this).truncationOrder(definitions(this));
      if (cyclic && options.cascade !== true) {
        throw new Error(CYCLIC_TRUNCATE);
      }
      const truncates = truncations(this, models, options);
      if (options.cascade === true) {
        for (const truncate of truncates) {
          await truncate();
        }
      } else {
        await Promise.all(truncates.map((truncate) => truncate()));
      }
    }
  };
