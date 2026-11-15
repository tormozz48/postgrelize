import inflection from 'inflection';
import type { ModelAttributes } from '../model/model-definition.ts';
import type { AnyModel, ModelStatic, Values } from '../model/options.ts';
import { ModelRegistry } from '../model/model-registry.ts';
import { Association, type AccessorOptions } from './association.ts';
import { AssociationKeys } from './association-keys.ts';
import type { BelongsToManyOptions, ThroughOptions } from './types.ts';

const registry = new ModelRegistry();

type Model = ModelStatic<AnyModel>;
type Instance = AnyModel;
type LinkOptions = AccessorOptions & Readonly<{ through?: Values }>;

const keys = new AssociationKeys();

const isThroughOptions = (value: BelongsToManyOptions['through']): value is ThroughOptions =>
  typeof value === 'object' && value !== null && 'model' in value;

const throughModel = (
  source: Model,
  through: string | Model,
  attributes: ModelAttributes,
): Model => {
  const { runtime } = registry.state(source);
  if (typeof through !== 'string') {
    registry.addAssociationAttributes(through, attributes);
    return through;
  }
  const existing = runtime.models()[through] as Model | undefined;
  if (existing !== undefined) {
    registry.addAssociationAttributes(existing, attributes);
    return existing;
  }
  const created = runtime.defineModel(through, {}, { tableName: through }) as Model;
  registry.addAssociationAttributes(created, attributes);
  return created;
};

/**
 * `source.belongsToMany(target, { through })` (Sequelize v6 `BelongsToMany`): both foreign keys
 * live on a junction model, which is created when given by name.
 */
export class BelongsToMany extends Association {
  readonly #junction: Model;
  readonly #junctionName: string;
  readonly #otherKey: string;

  /**
   * Adds the foreign key attributes to the junction model and registers the association.
   *
   * @param source - Model the association is defined on.
   * @param target - Associated model.
   * @param options - Association options with `through`.
   */
  constructor(source: Model, target: Model, options: BelongsToManyOptions) {
    const name = keys.aliasNames(options.as, keys.modelName(target), true);
    const sourceKey = options.sourceKey ?? keys.primaryKey(source);
    const targetKey = options.targetKey ?? keys.primaryKey(target);
    const selfAssociation = source === target;
    const foreignKey =
      keys.foreignKeyName(options.foreignKey) ??
      keys.camelize(`${keys.modelName(source).singular}_${sourceKey}`);
    const otherKey =
      keys.foreignKeyName(options.otherKey) ??
      keys.camelize(
        `${selfAssociation ? inflection.singularize(name.plural) : keys.modelName(target).singular}_${targetKey}`,
      );
    const throughOption = isThroughOptions(options.through)
      ? options.through
      : { model: options.through };
    const model = throughModel(source, throughOption.model, {
      [foreignKey]: keys.keyAttribute(
        keys.attributeOf(source, sourceKey),
        keys.foreignKeyExtras(options.foreignKey),
        {
          primaryKey: true,
          allowNull: false,
          ...keys.reference(
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
      [otherKey]: keys.keyAttribute(
        keys.attributeOf(target, targetKey),
        keys.foreignKeyExtras(options.otherKey),
        {
          primaryKey: true,
          allowNull: false,
          ...keys.reference(
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
        },
      ),
    } as ModelAttributes);
    super('BelongsToMany', source, target, options, name, {
      foreignKey,
      identifierField: keys.fieldOf(model, foreignKey),
      sourceKey,
      targetKey,
      otherKey,
      through: {
        model,
        ...(throughOption.scope === undefined ? {} : { scope: throughOption.scope }),
      },
    });
    this.#junction = model;
    this.#junctionName = registry.state(model).definition.name;
    this.#otherKey = otherKey;
    this.install();
  }

  /**
   * Loads the associated instances, each with its junction row under the junction model name
   * (`getXs`).
   *
   * @param instance - Source instance.
   * @param options - Find options.
   * @returns Associated instances.
   */
  async get(instance: Instance, options: AccessorOptions = {}): Promise<Instance[]> {
    const joined = await this.#links(instance, options);
    const byKey = new Map(joined.map((link) => [link.get(this.#otherKey), link]));
    const rows = (await this.target.findAll({
      ...options,
      where: this.andWhere(options.where, this.scope, { [this.targetKey]: [...byKey.keys()] }),
    } as never)) as Instance[];
    rows.forEach((row) => {
      (row.dataValues as Values)[this.#junctionName] = byKey.get(row.get(this.targetKey));
    });
    return rows;
  }

  /**
   * Counts the associated instances (`countXs`).
   *
   * @param instance - Source instance.
   * @param options - Count options.
   * @returns Number of associated rows.
   */
  async count(instance: Instance, options: AccessorOptions = {}): Promise<number> {
    const linked = (await this.#links(instance, options)).map((link) => link.get(this.#otherKey));
    return this.target.count({
      ...options,
      where: this.andWhere(options.where, this.scope, { [this.targetKey]: linked }),
    } as never) as Promise<number>;
  }

  /**
   * Checks whether all given instances are associated (`hasX` / `hasXs`).
   *
   * @param instance - Source instance.
   * @param items - Instance(s) or target key value(s).
   * @param options - Query options.
   * @returns True when every item is associated.
   */
  async has(instance: Instance, items: unknown, options: AccessorOptions = {}): Promise<boolean> {
    return (
      (await this.#links(instance, options, this.#ids(items))).length === this.#ids(items).length
    );
  }

  /**
   * Creates the missing junction rows (`addX` / `addXs`).
   *
   * @param instance - Source instance.
   * @param items - Instance(s) or target key value(s).
   * @param options - Query options; `through` gives junction values.
   * @returns The source instance.
   */
  async add(instance: Instance, items: unknown, options: LinkOptions = {}): Promise<Instance> {
    await this.#addLinks(instance, items, options);
    return instance;
  }

  /**
   * Deletes the junction rows (`removeX` / `removeXs`).
   *
   * @param instance - Source instance.
   * @param items - Instance(s) or target key value(s).
   * @param options - Query options.
   * @returns The source instance.
   */
  async remove(
    instance: Instance,
    items: unknown,
    options: AccessorOptions = {},
  ): Promise<Instance> {
    await this.#removeLinks(instance, items, options);
    return instance;
  }

  /**
   * Replaces the associated instances: deletes stale junction rows, adds missing ones (`setXs`).
   *
   * @param instance - Source instance.
   * @param items - Instance(s) or target key value(s).
   * @param options - Query options; `through` gives junction values.
   * @returns The source instance.
   */
  async set(instance: Instance, items: unknown, options: LinkOptions = {}): Promise<Instance> {
    const wanted = new Set(this.#ids(items));
    const stale = (await this.#links(instance, options))
      .map((link) => link.get(this.#otherKey))
      .filter((id) => !wanted.has(id));
    await this.#removeLinks(instance, stale, options);
    await this.#addLinks(instance, items, options);
    return instance;
  }

  /**
   * Creates an associated instance and its junction row (`createX`).
   *
   * @param instance - Source instance.
   * @param values - Values of the new instance.
   * @param options - Query options; `through` gives junction values.
   * @returns The created instance.
   */
  async create(
    instance: Instance,
    values: Values = {},
    options: LinkOptions = {},
  ): Promise<Instance> {
    const created = (await this.target.create(
      { ...values, ...this.scope } as never,
      this.passThrough(options) as never,
    )) as Instance;
    await this.#addLinks(instance, created, options);
    return created;
  }

  #own(instance: Instance): Values {
    return { [this.foreignKey]: instance.get(this.sourceKey), ...this.through?.scope };
  }

  #ids(items: unknown): readonly unknown[] {
    return this.toArray(items).map((item) => this.keyOf(item, this.targetKey));
  }

  #links(
    instance: Instance,
    options: AccessorOptions,
    wanted?: readonly unknown[],
  ): Promise<Instance[]> {
    return this.#junction.findAll({
      ...this.passThrough(options),
      where: this.andWhere(
        this.#own(instance),
        wanted === undefined ? undefined : { [this.#otherKey]: wanted },
      ),
    } as never) as Promise<Instance[]>;
  }

  async #addLinks(instance: Instance, items: unknown, options: LinkOptions): Promise<void> {
    const wanted = this.#ids(items);
    const existing = new Set(
      (await this.#links(instance, options, wanted)).map((link) => link.get(this.#otherKey)),
    );
    const missing = wanted.filter((id) => !existing.has(id));
    if (missing.length > 0) {
      await this.#junction.bulkCreate(
        missing.map((id) => ({
          ...options.through,
          ...this.#own(instance),
          [this.#otherKey]: id,
        })) as never,
        this.passThrough(options) as never,
      );
    }
  }

  async #removeLinks(instance: Instance, items: unknown, options: AccessorOptions): Promise<void> {
    const wanted = this.#ids(items);
    if (wanted.length > 0) {
      await this.#junction.destroy({
        ...this.passThrough(options),
        where: this.andWhere(this.#own(instance), { [this.#otherKey]: wanted }),
      } as never);
    }
  }
}
