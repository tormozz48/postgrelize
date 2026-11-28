import { inflector as inflection } from '../model/inflector.ts';
import type { ModelAttributes } from '../model/model-definition.ts';
import { ModelRegistry } from '../model/model-registry.ts';
import type { AnyModel, ModelStatic, Values } from '../model/options.ts';
import type { AssociationKeys, TargetKeys } from './association-keys.ts';
import type {
  Association,
  AssociationName,
  BelongsToManyOptions,
  ForeignKeyOptions,
  ThroughOptions,
} from './types.ts';
import { junctionPlurals } from '../model/junction-plurals.ts';

const registry = new ModelRegistry();

type Model = ModelStatic<AnyModel>;

/** Alias, keys and foreign key attribute names of a belongsToMany association. */
type JunctionNames = Readonly<{
  name: AssociationName;
  sourceKey: string;
  targetKey: string;
  foreignKey: string;
  otherKey: string;
}>;

/** Resolves alias and keys of belongsToMany and defines the junction model's key attributes. */
export class JunctionKeys {
  readonly #keys: AssociationKeys;

  /**
   * @param keys - Naming and foreign key attribute rules.
   */
  constructor(keys: AssociationKeys) {
    this.#keys = keys;
  }

  /**
   * Resolves the alias and keys of a belongsToMany association, creating the junction model
   * when given by name and adding both foreign key attributes to it.
   *
   * @param source - Model the association is defined on.
   * @param target - Associated model.
   * @param options - Association options with `through`.
   * @returns Alias forms and keys (including the junction).
   */
  resolve(source: Model, target: Model, options: BelongsToManyOptions): TargetKeys {
    const through = this.#through(options);
    const model = this.#throughModel(source, through.model, options, through, target);
    const paired = this.#paired(source, target, model);
    const own = this.#names(source, target, options);
    const names = paired === undefined ? own : this.#pair(own, options, paired, source, model);
    this.#addKeys(model, [source, target], names, through, options);
    return {
      name: names.name,
      keys: {
        foreignKey: names.foreignKey,
        identifierField: this.#keys.fieldOf(model, names.foreignKey),
        ...this.#identifiers(source, target, model, names),
        sourceKey: names.sourceKey,
        targetKey: names.targetKey,
        otherKey: names.otherKey,
        through: { model, ...(through.scope === undefined ? {} : { scope: through.scope }) },
      },
    };
  }

  #names(source: Model, target: Model, options: BelongsToManyOptions): JunctionNames {
    const keys = this.#keys;
    const name = keys.aliasNames(options.as, keys.modelName(target), true);
    const sourceKey = options.sourceKey ?? keys.primaryKey(source);
    const targetKey = options.targetKey ?? keys.primaryKey(target);
    const targetPrefix =
      source === target ? inflection.singularize(name.plural) : keys.modelName(target).singular;
    const foreignKey =
      keys.foreignKeyName(options.foreignKey) ??
      keys.camelize(`${keys.modelName(source).singular}_${sourceKey}`);
    const otherKey =
      keys.foreignKeyName(options.otherKey) ?? keys.camelize(`${targetPrefix}_${targetKey}`);
    return { name, sourceKey, targetKey, foreignKey, otherKey };
  }

  // public v6 properties that are not part of the declared association type
  #identifiers(source: Model, target: Model, model: Model, names: JunctionNames): Values {
    return {
      identifier: names.foreignKey,
      foreignIdentifier: names.otherKey,
      foreignIdentifierField: this.#keys.fieldOf(model, names.otherKey),
      sourceKeyField: this.#keys.fieldOf(source, names.sourceKey),
      targetKeyField: this.#keys.fieldOf(target, names.targetKey),
    };
  }

  // the belongsToMany of the other side that uses the same junction
  #paired(source: Model, target: Model, model: Model): Association | undefined {
    return [...(registry.state(target).associations.values() as Iterable<Association>)].find(
      (association) =>
        association.associationType === 'BelongsToMany' &&
        association.target === source &&
        association.through?.model === model,
    );
  }

  // like v6, keys that neither side named follow the keys of the other side
  #pair(
    names: JunctionNames,
    options: BelongsToManyOptions,
    paired: Association,
    source: Model,
    model: Model,
  ): JunctionNames {
    const targetKey = options.targetKey ?? paired.sourceKey;
    const own = this.#names(source, paired.source, { ...options, targetKey });
    const otherKey = options.otherKey === undefined ? paired.foreignKey : own.otherKey;
    this.#repair(paired, this.#pairedNames(paired, names), model);
    return { ...names, targetKey, otherKey };
  }

  #pairedNames(paired: Association, names: JunctionNames): JunctionNames {
    const { targetKey, otherKey } = paired.options as BelongsToManyOptions;
    return {
      name: paired.name,
      sourceKey: paired.sourceKey,
      targetKey: targetKey ?? names.sourceKey,
      foreignKey: paired.foreignKey,
      otherKey: otherKey === undefined ? names.foreignKey : (paired.otherKey as string),
    };
  }

  #repair(paired: Association, names: JunctionNames, model: Model): void {
    if (names.otherKey === paired.otherKey && names.targetKey === paired.targetKey) {
      return;
    }
    // v6 `primaryKeyDeleted`: re-added keys stay the primary key that replaced a generated one
    const composite = this.#formsKey(model, [paired.foreignKey, paired.otherKey as string]);
    if (names.otherKey !== paired.otherKey) {
      registry.removeAttribute(model, paired.otherKey as string);
    }
    this.#reAddKeys(model, paired, names, composite);
    Object.assign(paired, {
      targetKey: names.targetKey,
      otherKey: names.otherKey,
      ...this.#identifiers(paired.source, paired.target, model, names),
    });
  }

  #reAddKeys(model: Model, paired: Association, names: JunctionNames, composite: boolean): void {
    const options = paired.options as BelongsToManyOptions;
    const ends = [paired.source, paired.target] as const;
    if (composite) {
      this.#addAttributes(model, ends, names, options, { primaryKey: true, allowNull: false });
    } else {
      this.#addKeys(model, ends, names, this.#through(options), options);
    }
  }

  // whether an association, not the model, made the keys the primary key
  #formsKey(model: Model, keys: readonly string[]): boolean {
    const { definition, input } = registry.state(model);
    return keys.every(
      (key) =>
        definition.primaryKeys.includes(key) &&
        (input.attributes[key] as { primaryKey?: boolean } | undefined)?.primaryKey !== true,
    );
  }

  // v6 `_injectAttributes`: the keys form the primary key only in place of a generated one,
  // otherwise the declared primary key stays and the keys form a unique key
  #addKeys(
    model: Model,
    [source, target]: readonly [Model, Model],
    names: JunctionNames,
    through: ThroughOptions,
    options: BelongsToManyOptions,
  ): void {
    const keys = [names.foreignKey, names.otherKey];
    const role = this.#replaceGeneratedKey(model, keys)
      ? { primaryKey: true, allowNull: false }
      : this.#uniqueKey(model, keys, through, options);
    this.#addAttributes(model, [source, target], names, options, role);
  }

  #addAttributes(
    model: Model,
    [source, target]: readonly [Model, Model],
    names: JunctionNames,
    options: BelongsToManyOptions,
    role: Values,
  ): void {
    const { foreignKey, otherKey, sourceKey, targetKey } = names;
    registry.addAssociationAttributes(model, {
      [foreignKey]: this.#attribute(source, sourceKey, options.foreignKey, options, role),
      [otherKey]: this.#attribute(target, targetKey, options.otherKey, options, role),
    } as ModelAttributes);
  }

  // whether the primary key was generated (the automatic `id`, or keys of an earlier
  // belongsToMany); an automatic `id` that is not one of the keys is removed
  #replaceGeneratedKey(model: Model, keys: readonly string[]): boolean {
    const { definition, input } = registry.state(model);
    const generated = definition.primaryKeys.filter(
      (name) =>
        definition.attributes.get(name)?._autoGenerated === true ||
        (!(name in input.attributes) && name in input.extra),
    );
    if (generated.includes('id') && !keys.includes('id') && !('id' in input.extra)) {
      registry.removeAttribute(model, 'id');
    }
    return generated.length > 0;
  }

  #uniqueKey(
    model: Model,
    keys: readonly string[],
    through: ThroughOptions,
    { uniqueKey }: BelongsToManyOptions,
  ): Values {
    const { tableName, primaryKeys } = registry.state(model).definition;
    // keys that already are the whole primary key: a named constraint would rename it
    const isPrimaryKey =
      primaryKeys.length === keys.length && keys.every((key) => primaryKeys.includes(key));
    if (through.unique === false || isPrimaryKey) {
      return {};
    }
    return { unique: uniqueKey || [tableName, ...keys, 'unique'].join('_') };
  }

  #through(options: BelongsToManyOptions): ThroughOptions {
    const { through } = options;
    return typeof through === 'object' && through !== null && 'model' in through
      ? through
      : { model: through };
  }

  #attribute(
    model: Model,
    key: string,
    option: string | ForeignKeyOptions | undefined,
    options: BelongsToManyOptions,
    role: Values,
  ): Values {
    const keys = this.#keys;
    const spec = {
      model,
      key,
      onDelete: options.onDelete,
      onUpdate: options.onUpdate,
      constraints: options.constraints,
    };
    return keys.keyAttribute(keys.attributeOf(model, key), keys.foreignKeyExtras(option), {
      ...role,
      ...keys.reference(spec, { onDelete: 'CASCADE', onUpdate: 'CASCADE' }),
    });
  }

  // model options a junction defined by name takes from the association (v6 passes them on)
  #modelOptions(through: ThroughOptions, options: BelongsToManyOptions): Values {
    const picked = ['timestamps', 'createdAt', 'updatedAt', 'deletedAt', 'underscored', 'schema'];
    return {
      ...Object.fromEntries(Object.entries(options).filter(([key]) => picked.includes(key))),
      paranoid: through.paranoid === true,
    };
  }

  #throughModel(
    source: Model,
    through: string | Model,
    options: BelongsToManyOptions,
    given: ThroughOptions,
    target: Model,
  ): Model {
    if (typeof through !== 'string') {
      return through;
    }
    const { runtime } = registry.state(source);
    const existing = runtime.models()[through] as Model | undefined;
    if (existing !== undefined) {
      return existing;
    }
    const model = this.#define(source, through, this.#modelOptions(given, options));
    junctionPlurals.set(model, this.#names(source, target, options).name.plural);
    return model;
  }

  #define(source: Model, name: string, options: Values): Model {
    const { runtime } = registry.state(source);
    return runtime.defineModel(name, {}, { ...options, tableName: name }) as Model;
  }
}
