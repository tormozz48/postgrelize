import { ModelRegistry } from '../model/model-registry.ts';
import type { QueryOptionsBase } from '../model/runtime.ts';
import {
  SchemaSynchronizer,
  type DropOptions,
  type SyncOptions,
} from '../query-interface/schema-synchronizer.ts';
import type { SequelizeConstructor } from './sequelize-constructor.ts';

const registry = new ModelRegistry();

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
      await this.#synchronizer().syncAll(this.#definitions(), options);
      return this;
    }

    /**
     * Drops the tables of all defined models in reverse foreign-key order.
     *
     * @param options - `cascade` and query options.
     * @returns Resolves when done.
     */
    async drop(options: DropOptions = {}): Promise<void> {
      await this.#synchronizer().dropAll(this.#definitions(), options);
    }

    #synchronizer(): SchemaSynchronizer {
      return new SchemaSynchronizer(this.internals.runtime, this.getQueryInterface());
    }

    #definitions(): ReturnType<ModelRegistry['definition']>[] {
      return Object.values(this.models).map((model) => registry.definition(model));
    }
  };
