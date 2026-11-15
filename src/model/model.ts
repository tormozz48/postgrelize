import { ModelBase } from './model-base.ts';
import { ModelInstancePersistence } from './model-instance-persistence.ts';
import { ModelInstanceValues } from './model-instance-values.ts';
import { ModelAggregates } from './mixins/model-aggregates.ts';
import { ModelAssociations } from './mixins/model-associations.ts';
import { ModelFinders } from './mixins/model-finders.ts';
import { ModelHooks } from './mixins/model-hooks.ts';
import { ModelPostgres } from './mixins/model-postgres.ts';
import { ModelSchema } from './mixins/model-schema.ts';
import { ModelSchemaBinding } from './mixins/model-schema-binding.ts';
import { ModelScopes } from './mixins/model-scopes.ts';
import { ModelWriters } from './mixins/model-writers.ts';
import type { BuildOptions, Values } from './options.ts';

export type { NamedHookAdder } from './mixins/named-hooks.ts';

const ModelStatics = ModelPostgres(
  ModelWriters(
    ModelAggregates(
      ModelFinders(
        ModelSchemaBinding(ModelScopes(ModelHooks(ModelSchema(ModelAssociations(ModelBase))))),
      ),
    ),
  ),
);

// Instance methods use the class type parameters, which mixins cannot see: they are declared on the
// merged interface below and copied onto the prototype at the end of this file.
// oxlint-disable-next-line typescript/no-unsafe-declaration-merging -- intentional merge.
export interface Model<
  TAttributes extends object = Values,
  // oxlint-disable-next-line no-unused-vars -- merged declarations need identical type parameters.
  TCreationAttributes extends object = TAttributes,
>
  extends ModelInstanceValues<TAttributes>, ModelInstancePersistence<TAttributes> {}

/**
 * Base class of models, API-compatible with Sequelize v6 `Model`.
 *
 * @typeParam TAttributes - Attribute types (usually `InferAttributes<M>`).
 * @typeParam TCreationAttributes - Attribute types accepted on creation (usually `InferCreationAttributes<M>`).
 * @example
 * ```ts
 * class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
 *   declare id: CreationOptional<number>;
 *   declare email: string;
 * }
 * User.init({ id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }, email: DataTypes.STRING }, { sequelize });
 * ```
 */
// oxlint-disable-next-line typescript/no-unsafe-declaration-merging -- see the interface above.
export class Model<
  TAttributes extends object = Values,
  TCreationAttributes extends object = TAttributes,
> extends ModelStatics {
  /** Phantom type of attributes; not set at runtime. */
  declare _attributes: TAttributes;

  /** Phantom type of creation attributes; not set at runtime. */
  declare _creationAttributes: TCreationAttributes;

  /** Current attribute values. */
  declare dataValues: TAttributes;

  /** Values as of the last load/save. */
  declare _previousDataValues: Partial<TAttributes>;

  /** True until the instance is saved or when built from a query result. */
  declare isNewRecord: boolean;

  /** Model class of the instance. */
  get _model(): typeof Model {
    return this.constructor as typeof Model;
  }

  /**
   * Builds an instance without saving it. Prefer `Model.build`.
   *
   * @param values - Attribute values.
   * @param options - Build options.
   */
  constructor(values: Partial<TCreationAttributes> | Values = {}, options: BuildOptions = {}) {
    super(values as Values, options);
  }
}

for (const source of [ModelInstanceValues, ModelInstancePersistence]) {
  for (const key of Object.getOwnPropertyNames(source.prototype)) {
    if (key !== 'constructor') {
      Object.defineProperty(
        Model.prototype,
        key,
        Object.getOwnPropertyDescriptor(source.prototype, key) as PropertyDescriptor,
      );
    }
  }
}
