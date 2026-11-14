import inflection from 'inflection';
import { AssociationError } from '../errors/errors.ts';
import { Op } from '../expressions/op.ts';
import type { AttributeDefinition, ModelAttributes } from '../model/definition.ts';
import type { AnyModel, ModelStatic, Values } from '../model/options.ts';
import { addAssociationAttributes, stateOf, updateState } from '../model/state.ts';
import type {
  Association,
  AssociationName,
  AssociationOptions,
  AssociationType,
  BelongsToManyOptions,
  ForeignKeyOptions,
  ThroughOptions,
} from './types.ts';

type Model = ModelStatic<AnyModel>;
type Instance = AnyModel;

const camelize = (value: string): string =>
  value.trim().replace(/[-_\s]+(.)?/g, (_match, char?: string) => (char ?? '').toUpperCase());

const upperFirst = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

const modelName = (model: Model): AssociationName => {
  const name = stateOf(model).definition.name;
  return { singular: inflection.singularize(name), plural: inflection.pluralize(name) };
};

const primaryKey = (model: Model): string => stateOf(model).definition.primaryKeys[0] ?? 'id';

const attributeOf = (model: Model, name: string): AttributeDefinition | undefined =>
  stateOf(model).definition.attributes.get(name);

const fieldOf = (model: Model, name: string): string => attributeOf(model, name)?.field ?? name;

const foreignKeyName = (option: string | ForeignKeyOptions | undefined): string | undefined =>
  option === undefined ? undefined : typeof option === 'string' ? option : option.name;

const foreignKeyExtras = (option: string | ForeignKeyOptions | undefined): ForeignKeyOptions =>
  option === undefined || typeof option === 'string' ? {} : option;

const aliasNames = (
  as: string | AssociationName | undefined,
  fallback: AssociationName,
  multi: boolean,
): AssociationName =>
  as === undefined
    ? fallback
    : typeof as === 'string'
      ? multi
        ? { singular: inflection.singularize(as), plural: as }
        : { singular: as, plural: inflection.pluralize(as) }
      : as;

type ReferenceSpec = Readonly<{
  model: Model;
  key: string;
  onDelete: string | undefined;
  onUpdate: string | undefined;
  constraints: boolean | undefined;
}>;

const referenceOf = (
  spec: ReferenceSpec,
  allowNull: boolean,
  defaults: Readonly<{ onDelete: string; onUpdate: string }>,
): Values => {
  if (spec.constraints === false) {
    return {};
  }
  const definition = stateOf(spec.model).definition;
  return {
    references: {
      model: {
        tableName: definition.tableName,
        ...(definition.schema === undefined ? {} : { schema: definition.schema }),
      },
      key: definition.attributes.get(spec.key)?.field ?? spec.key,
    },
    onDelete:
      spec.onDelete ??
      (defaults.onDelete === 'auto' ? (allowNull ? 'SET NULL' : 'NO ACTION') : defaults.onDelete),
    onUpdate: spec.onUpdate ?? defaults.onUpdate,
  };
};

const keyAttribute = (
  type: AttributeDefinition | undefined,
  extras: ForeignKeyOptions,
  base: Values = {},
): Values => ({
  type: type?.type,
  allowNull: true,
  ...base,
  ...(extras.field === undefined ? {} : { field: extras.field }),
  ...(extras.allowNull === undefined ? {} : { allowNull: extras.allowNull }),
});

const accessorsFor = (
  type: AssociationType,
  name: AssociationName,
): Readonly<Record<string, string>> => {
  const singular = upperFirst(name.singular);
  const plural = upperFirst(name.plural);
  return type === 'BelongsTo' || type === 'HasOne'
    ? { get: `get${singular}`, set: `set${singular}`, create: `create${singular}` }
    : {
        get: `get${plural}`,
        set: `set${plural}`,
        addMultiple: `add${plural}`,
        add: `add${singular}`,
        create: `create${singular}`,
        remove: `remove${singular}`,
        removeMultiple: `remove${plural}`,
        hasSingle: `has${singular}`,
        hasAll: `has${plural}`,
        count: `count${plural}`,
      };
};

const register = (association: Association): Association => {
  updateState(association.source, (state) => {
    if (state.associations.has(association.as)) {
      throw new AssociationError(
        `You have used the alias ${association.as} in two separate associations. Aliased associations must have unique aliases.`,
      );
    }
    return {
      ...state,
      associations: new Map([...state.associations, [association.as, association]]),
    };
  });
  mixin(association);
  return association;
};

const base = (
  type: AssociationType,
  source: Model,
  target: Model,
  options: AssociationOptions,
  name: AssociationName,
): Omit<
  Association,
  'foreignKey' | 'identifierField' | 'sourceKey' | 'targetKey' | 'otherKey' | 'through'
> => ({
  associationType: type,
  source,
  target,
  as: type === 'HasMany' || type === 'BelongsToMany' ? name.plural : name.singular,
  name,
  isAliased: options.as !== undefined,
  scope: options.scope,
  isSingleAssociation: type === 'BelongsTo' || type === 'HasOne',
  isMultiAssociation: type === 'HasMany' || type === 'BelongsToMany',
  accessors: accessorsFor(type, name),
});

/** Defines `source.belongsTo(target)`: the foreign key lives on the source. */
export const belongsTo = (
  source: Model,
  target: Model,
  options: AssociationOptions = {},
): Association => {
  const name = aliasNames(options.as, modelName(target), false);
  const targetKey = options.targetKey ?? primaryKey(target);
  const foreignKey =
    foreignKeyName(options.foreignKey) ?? camelize(`${name.singular}_${primaryKey(target)}`);
  addAssociationAttributes(source, {
    [foreignKey]: keyAttribute(
      attributeOf(target, targetKey),
      foreignKeyExtras(options.foreignKey),
      referenceOf(
        {
          model: target,
          key: targetKey,
          onDelete: options.onDelete,
          onUpdate: options.onUpdate,
          constraints: options.constraints,
        },
        foreignKeyExtras(options.foreignKey).allowNull !== false,
        {
          onDelete: 'auto',
          onUpdate: 'CASCADE',
        },
      ),
    ),
  } as ModelAttributes);
  return register({
    ...base('BelongsTo', source, target, options, name),
    foreignKey,
    identifierField: fieldOf(source, foreignKey),
    sourceKey: foreignKey,
    targetKey,
    otherKey: undefined,
    through: undefined,
  });
};

const hasKey = (
  type: 'HasOne' | 'HasMany',
  source: Model,
  target: Model,
  options: AssociationOptions,
): Association => {
  const multi = type === 'HasMany';
  const name = aliasNames(options.as, modelName(target), multi);
  const sourceKey = options.sourceKey ?? primaryKey(source);
  const sourcePrefix =
    type === 'HasOne'
      ? inflection.singularize(
          typeof options.as === 'string' ? options.as : modelName(source).singular,
        )
      : modelName(source).singular;
  const foreignKey =
    foreignKeyName(options.foreignKey) ?? camelize(`${sourcePrefix}_${primaryKey(source)}`);
  addAssociationAttributes(target, {
    [foreignKey]: keyAttribute(
      attributeOf(source, sourceKey),
      foreignKeyExtras(options.foreignKey),
      referenceOf(
        {
          model: source,
          key: sourceKey,
          onDelete: options.onDelete,
          onUpdate: options.onUpdate,
          constraints: options.constraints,
        },
        foreignKeyExtras(options.foreignKey).allowNull !== false,
        {
          onDelete: 'auto',
          onUpdate: 'CASCADE',
        },
      ),
    ),
  } as ModelAttributes);
  return register({
    ...base(type, source, target, options, name),
    foreignKey,
    identifierField: fieldOf(target, foreignKey),
    sourceKey,
    targetKey: foreignKey,
    otherKey: undefined,
    through: undefined,
  });
};

/** Defines `source.hasOne(target)`: the foreign key lives on the target. */
export const hasOne = (
  source: Model,
  target: Model,
  options: AssociationOptions = {},
): Association => hasKey('HasOne', source, target, options);

/** Defines `source.hasMany(target)`: the foreign key lives on the target. */
export const hasMany = (
  source: Model,
  target: Model,
  options: AssociationOptions = {},
): Association => hasKey('HasMany', source, target, options);

const isThroughOptions = (value: BelongsToManyOptions['through']): value is ThroughOptions =>
  typeof value === 'object' && value !== null && 'model' in value;

const throughModel = (
  source: Model,
  through: string | Model,
  attributes: ModelAttributes,
): Model => {
  const { runtime } = stateOf(source);
  if (typeof through !== 'string') {
    addAssociationAttributes(through, attributes);
    return through;
  }
  const existing = runtime.models()[through] as Model | undefined;
  if (existing !== undefined) {
    addAssociationAttributes(existing, attributes);
    return existing;
  }
  const created = runtime.defineModel(through, {}, { tableName: through }) as Model;
  addAssociationAttributes(created, attributes);
  return created;
};

/** Defines `source.belongsToMany(target, { through })` with a junction model. */
export const belongsToMany = (
  source: Model,
  target: Model,
  options: BelongsToManyOptions,
): Association => {
  const name = aliasNames(options.as, modelName(target), true);
  const sourceKey = options.sourceKey ?? primaryKey(source);
  const targetKey = options.targetKey ?? primaryKey(target);
  const selfAssociation = source === target;
  const foreignKey =
    foreignKeyName(options.foreignKey) ?? camelize(`${modelName(source).singular}_${sourceKey}`);
  const otherKey =
    foreignKeyName(options.otherKey) ??
    camelize(
      `${selfAssociation ? inflection.singularize(name.plural) : modelName(target).singular}_${targetKey}`,
    );
  const throughOption = isThroughOptions(options.through)
    ? options.through
    : { model: options.through };
  const model = throughModel(source, throughOption.model, {
    [foreignKey]: keyAttribute(
      attributeOf(source, sourceKey),
      foreignKeyExtras(options.foreignKey),
      {
        primaryKey: true,
        allowNull: false,
        ...referenceOf(
          {
            model: source,
            key: sourceKey,
            onDelete: options.onDelete,
            onUpdate: options.onUpdate,
            constraints: options.constraints,
          },
          false,
          { onDelete: 'CASCADE', onUpdate: 'CASCADE' },
        ),
      },
    ),
    [otherKey]: keyAttribute(attributeOf(target, targetKey), foreignKeyExtras(options.otherKey), {
      primaryKey: true,
      allowNull: false,
      ...referenceOf(
        {
          model: target,
          key: targetKey,
          onDelete: options.onDelete,
          onUpdate: options.onUpdate,
          constraints: options.constraints,
        },
        false,
        { onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      ),
    }),
  } as ModelAttributes);
  return register({
    ...base('BelongsToMany', source, target, options, name),
    foreignKey,
    identifierField: fieldOf(model, foreignKey),
    sourceKey,
    targetKey,
    otherKey,
    through: {
      model,
      ...(throughOption.scope === undefined ? {} : { scope: throughOption.scope }),
    },
  });
};

/** Associations of a model by alias. */
export const associationsOf = (model: object): ReadonlyMap<string, Association> =>
  stateOf(model).associations as ReadonlyMap<string, Association>;

const toArray = <T>(value: T | readonly T[] | null | undefined): readonly T[] =>
  value === null || value === undefined ? [] : Array.isArray(value) ? value : [value as T];

const keyOf = (item: unknown, key: string): unknown =>
  typeof item === 'object' && item !== null && 'get' in item ? (item as Instance).get(key) : item;

const andWhere = (...parts: readonly unknown[]): Values => ({
  [Op.and]: parts.filter((part) => part !== undefined && part !== null),
});

type QueryOptions = Values &
  Readonly<{ where?: unknown; transaction?: unknown; logging?: unknown }>;

const passThrough = (options: QueryOptions): Values =>
  Object.fromEntries(
    Object.entries(options).filter(([key]) =>
      ['transaction', 'logging', 'benchmark'].includes(key),
    ),
  );

const singleMethods = (
  association: Association,
): Readonly<Record<string, (this: Instance, ...args: never[]) => unknown>> => {
  const { target, foreignKey, sourceKey, targetKey, associationType } = association;
  if (associationType === 'BelongsTo') {
    return {
      get(this: Instance, options: QueryOptions = {}) {
        const value = this.get(foreignKey);
        return value === null || value === undefined
          ? Promise.resolve(null)
          : target.findOne({
              ...options,
              where: andWhere(options.where, association.scope, { [targetKey]: value }),
            } as never);
      },
      async set(
        this: Instance,
        associated: unknown,
        options: QueryOptions & Readonly<{ save?: boolean }> = {},
      ) {
        this.set(foreignKey, associated === null ? null : keyOf(associated, targetKey));
        if (options.save !== false) {
          await this.save({ ...passThrough(options), fields: [foreignKey] } as never);
        }
        return this;
      },
      async create(this: Instance, values: Values = {}, options: QueryOptions = {}) {
        const created = await target.create(
          { ...values, ...association.scope } as never,
          passThrough(options) as never,
        );
        this.set(foreignKey, created.get(targetKey));
        await this.save({ ...passThrough(options), fields: [foreignKey] } as never);
        return created;
      },
    };
  }
  return {
    get(this: Instance, options: QueryOptions = {}) {
      return target.findOne({
        ...options,
        where: andWhere(options.where, association.scope, { [foreignKey]: this.get(sourceKey) }),
      } as never);
    },
    async set(this: Instance, associated: unknown, options: QueryOptions = {}) {
      const value = this.get(sourceKey);
      const current = (await target.findOne({
        ...passThrough(options),
        where: { [foreignKey]: value },
      } as never)) as Instance | null;
      const next =
        associated === null || associated === undefined
          ? null
          : typeof associated === 'object' && 'get' in (associated as object)
            ? (associated as Instance)
            : ((await target.findByPk(
                associated,
                passThrough(options) as never,
              )) as Instance | null);
      if (
        current !== null &&
        (next === null || current.get(primaryKey(target)) !== next.get(primaryKey(target)))
      ) {
        current.set(foreignKey, null);
        await current.save({ ...passThrough(options), fields: [foreignKey] } as never);
      }
      if (next !== null) {
        next.set({ [foreignKey]: value, ...association.scope });
        await next.save(passThrough(options) as never);
      }
      return next;
    },
    create(this: Instance, values: Values = {}, options: QueryOptions = {}) {
      return target.create(
        { ...values, ...association.scope, [foreignKey]: this.get(sourceKey) } as never,
        passThrough(options) as never,
      );
    },
  };
};

const hasManyMethods = (
  association: Association,
): Readonly<Record<string, (this: Instance, ...args: never[]) => unknown>> => {
  const { target, foreignKey, sourceKey } = association;
  const targetPk = primaryKey(target);
  const own = (instance: Instance): Values => ({ [foreignKey]: instance.get(sourceKey) });
  const ids = (items: unknown): readonly unknown[] =>
    toArray(items).map((item) => keyOf(item, targetPk));
  return {
    get(this: Instance, options: QueryOptions = {}) {
      return target.findAll({
        ...options,
        where: andWhere(options.where, association.scope, own(this)),
      } as never);
    },
    count(this: Instance, options: QueryOptions = {}) {
      return target.count({
        ...options,
        where: andWhere(options.where, association.scope, own(this)),
      } as never);
    },
    async hasSingle(this: Instance, item: unknown, options: QueryOptions = {}) {
      const wanted = ids(item);
      return (
        (await target.count({
          ...passThrough(options),
          where: andWhere(association.scope, own(this), { [targetPk]: wanted }),
        } as never)) === wanted.length
      );
    },
    async addMultiple(this: Instance, items: unknown, options: QueryOptions = {}) {
      const wanted = ids(items);
      if (wanted.length > 0) {
        await target.update(
          { ...own(this), ...association.scope } as never,
          { ...passThrough(options), where: { [targetPk]: wanted } } as never,
        );
      }
      return this;
    },
    async removeMultiple(this: Instance, items: unknown, options: QueryOptions = {}) {
      const wanted = ids(items);
      if (wanted.length > 0) {
        await target.update(
          { [foreignKey]: null } as never,
          { ...passThrough(options), where: andWhere(own(this), { [targetPk]: wanted }) } as never,
        );
      }
      return this;
    },
    async set(this: Instance, items: unknown, options: QueryOptions = {}) {
      const wanted = ids(items);
      await target.update(
        { [foreignKey]: null } as never,
        {
          ...passThrough(options),
          where: andWhere(
            own(this),
            wanted.length === 0 ? undefined : { [targetPk]: { [Op.notIn]: wanted } },
          ),
        } as never,
      );
      if (wanted.length > 0) {
        await target.update(
          { ...own(this), ...association.scope } as never,
          { ...passThrough(options), where: { [targetPk]: wanted } } as never,
        );
      }
      return this;
    },
    create(this: Instance, values: Values = {}, options: QueryOptions = {}) {
      return target.create(
        { ...values, ...association.scope, ...own(this) } as never,
        passThrough(options) as never,
      );
    },
  };
};

const belongsToManyMethods = (
  association: Association,
): Readonly<Record<string, (this: Instance, ...args: never[]) => unknown>> => {
  const { target, foreignKey, sourceKey, targetKey, otherKey = '', through } = association;
  if (through === undefined) {
    throw new Error('belongsToMany requires a through model');
  }
  const junction = through.model;
  const junctionName = stateOf(junction).definition.name;
  const own = (instance: Instance): Values => ({
    [foreignKey]: instance.get(sourceKey),
    ...through.scope,
  });
  const ids = (items: unknown): readonly unknown[] =>
    toArray(items).map((item) => keyOf(item, targetKey));
  const links = (
    instance: Instance,
    options: QueryOptions,
    wanted?: readonly unknown[],
  ): Promise<Instance[]> =>
    junction.findAll({
      ...passThrough(options),
      where: andWhere(own(instance), wanted === undefined ? undefined : { [otherKey]: wanted }),
    } as never) as Promise<Instance[]>;
  const add = async (
    instance: Instance,
    items: unknown,
    options: QueryOptions & Readonly<{ through?: Values }>,
  ): Promise<void> => {
    const wanted = ids(items);
    const existing = new Set(
      (await links(instance, options, wanted)).map((link) => link.get(otherKey)),
    );
    const missing = wanted.filter((id) => !existing.has(id));
    if (missing.length > 0) {
      await junction.bulkCreate(
        missing.map((id) => ({ ...options.through, ...own(instance), [otherKey]: id })) as never,
        passThrough(options) as never,
      );
    }
  };
  const remove = async (
    instance: Instance,
    items: unknown,
    options: QueryOptions,
  ): Promise<void> => {
    const wanted = ids(items);
    if (wanted.length > 0) {
      await junction.destroy({
        ...passThrough(options),
        where: andWhere(own(instance), { [otherKey]: wanted }),
      } as never);
    }
  };
  return {
    async get(this: Instance, options: QueryOptions = {}) {
      const joined = await links(this, options);
      const byKey = new Map(joined.map((link) => [link.get(otherKey), link]));
      const rows = (await target.findAll({
        ...options,
        where: andWhere(options.where, association.scope, { [targetKey]: [...byKey.keys()] }),
      } as never)) as Instance[];
      rows.forEach((row) => {
        (row.dataValues as Values)[junctionName] = byKey.get(row.get(targetKey));
      });
      return rows;
    },
    async count(this: Instance, options: QueryOptions = {}) {
      const keys = (await links(this, options)).map((link) => link.get(otherKey));
      return target.count({
        ...options,
        where: andWhere(options.where, association.scope, { [targetKey]: keys }),
      } as never);
    },
    async hasSingle(this: Instance, items: unknown, options: QueryOptions = {}) {
      return (await links(this, options, ids(items))).length === ids(items).length;
    },
    async addMultiple(this: Instance, items: unknown, options: QueryOptions = {}) {
      await add(this, items, options);
      return this;
    },
    async removeMultiple(this: Instance, items: unknown, options: QueryOptions = {}) {
      await remove(this, items, options);
      return this;
    },
    async set(this: Instance, items: unknown, options: QueryOptions = {}) {
      const wanted = new Set(ids(items));
      const stale = (await links(this, options))
        .map((link) => link.get(otherKey))
        .filter((id) => !wanted.has(id));
      await remove(this, stale, options);
      await add(this, items, options);
      return this;
    },
    async create(
      this: Instance,
      values: Values = {},
      options: QueryOptions & Readonly<{ through?: Values }> = {},
    ) {
      const created = (await target.create(
        { ...values, ...association.scope } as never,
        passThrough(options) as never,
      )) as Instance;
      await add(this, created, options);
      return created;
    },
  };
};

const mixin = (association: Association): void => {
  const methods =
    association.associationType === 'HasMany'
      ? hasManyMethods(association)
      : association.associationType === 'BelongsToMany'
        ? belongsToManyMethods(association)
        : singleMethods(association);
  const aliases: Readonly<Record<string, string>> = {
    add: 'addMultiple',
    remove: 'removeMultiple',
    hasAll: 'hasSingle',
  };
  Object.entries(association.accessors).forEach(([key, methodName]) => {
    const implementation = methods[key] ?? methods[aliases[key] ?? ''];
    if (
      implementation !== undefined &&
      !Object.prototype.hasOwnProperty.call(association.source.prototype, methodName)
    ) {
      Object.defineProperty(association.source.prototype, methodName, {
        configurable: true,
        writable: true,
        value: implementation,
      });
    }
  });
};
