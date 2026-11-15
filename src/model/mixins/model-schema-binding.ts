import { registry } from '../model-services.ts';
import type { Model } from '../model.ts';
import type { AnyModel, ModelStatic } from '../options.ts';
import type { ModelConstructor } from './model-constructor.ts';

/**
 * Schema binding static of `Model`: `schema`.
 *
 * @internal
 */
// oxlint-disable-next-line max-lines-per-function, typescript/explicit-module-boundary-types -- a mixin factory's body is its class (each method is still size-checked); its type can only be inferred.
export const ModelSchemaBinding = <TBase extends ModelConstructor>(Base: TBase) => {
  return class SchemaBindingCapability extends Base {
    /**
     * Returns a model class whose queries target a PostgreSQL schema, like Sequelize v6.
     *
     * The copy has the attributes, hooks, scopes and associations of this model as they are at
     * the time of the call and keeps the scope selection of this class. Changes made to the
     * original afterwards are not seen by the copy.
     *
     * @param schema - Schema name.
     * @param options - Separator between schema and table reported by `getTableName` (a string,
     * or `{ schemaDelimiter }`); PostgreSQL always qualifies with `.` in SQL. Defaults to `.`.
     * @returns Schema-bound model class (instances are instances of this model).
     * @example
     * ```ts
     * const TenantUser = User.schema('tenant_a');
     * await TenantUser.findAll(); // SELECT ... FROM "tenant_a"."users"
     * TenantUser.getTableName(); // { tableName: 'users', schema: 'tenant_a', delimiter: '.' }
     * ```
     */
    static schema<MS extends ModelStatic<AnyModel>>(
      this: MS,
      schema: string,
      options?: string | Readonly<{ schemaDelimiter?: string }>,
    ): MS {
      const Bound = { [this.name]: class extends (this as unknown as typeof Model) {} }[
        this.name
      ] as unknown as MS;
      const delimiter = typeof options === 'string' ? options : options?.schemaDelimiter;
      registry.bindSchema(this, Bound, schema, delimiter || undefined);
      return Bound;
    }
  };
};
