import type { AnyModel, CountOptions, ModelStatic, Values } from '../model/options.ts';
import { ModelRegistry } from '../model/model-registry.ts';
import { Association, type AccessorOptions } from './association.ts';
import { AssociationKeys } from './association-keys.ts';
import { JunctionKeys } from './junction-keys.ts';
import type { AssociationThrough, BelongsToManyOptions } from './types.ts';

const registry = new ModelRegistry();

type Model = ModelStatic<AnyModel>;
type Instance = AnyModel;
type JoinOptions = Readonly<{ joinTableAttributes?: readonly string[] }>;
type LinkOptions = AccessorOptions & Readonly<{ through?: Values }>;

const junctionKeys = new JunctionKeys(new AssociationKeys());

/**
 * `source.belongsToMany(target, { through })` (Sequelize v6 `BelongsToMany`): both foreign keys
 * live on a junction model, which is created when given by name.
 */
export class BelongsToMany<
  S extends AnyModel = AnyModel,
  T extends AnyModel = AnyModel,
> extends Association<S, T> {
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
  constructor(source: ModelStatic<S>, target: ModelStatic<T>, options: BelongsToManyOptions) {
    const resolved = junctionKeys.resolve(source, target, options);
    const model = (resolved.keys.through as AssociationThrough).model;
    super('BelongsToMany', source, target, options, resolved.name, resolved.keys);
    this.#junction = model;
    this.#junctionName = registry.state(model).definition.name;
    this.#otherKey = resolved.keys.otherKey as string;
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
    const rows = (await this.scopedTarget(options).findAll({
      ...options,
      where: this.andWhere(options.where, this.scope, { [this.targetKey]: [...byKey.keys()] }),
    } as never)) as Instance[];
    const attributes = (options as JoinOptions).joinTableAttributes;
    rows.forEach((row) => {
      const link = byKey.get(this.#rowKey(row, options));
      this.#attach(row, link as Instance, attributes, options.raw === true);
    });
    return rows;
  }

  #rowKey(row: Instance, options: AccessorOptions): unknown {
    return options.raw === true
      ? (row as unknown as Values)[this.targetKey]
      : row.get(this.targetKey);
  }

  #attach(
    row: Instance,
    link: Instance,
    attributes: readonly string[] | undefined,
    raw: boolean,
  ): void {
    const names = attributes ?? Object.keys(link.dataValues as Values);
    if (raw) {
      names.forEach((name) => {
        (row as unknown as Values)[`${this.#junctionName}.${name}`] = link.get(name);
      });
    } else if (attributes === undefined || names.length > 0) {
      (row.dataValues as Values)[this.#junctionName] = link;
    }
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
    return this.scopedTarget(options).count({
      ...options,
      where: this.andWhere(options.where, this.scope, { [this.targetKey]: linked }),
    } as CountOptions);
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
   * Creates the missing junction rows and updates the through values of existing ones (`addX` /
   * `addXs`).
   *
   * @param instance - Source instance.
   * @param items - Instance(s) or target key value(s).
   * @param options - Query options; `through` gives junction values.
   * @returns The source instance.
   */
  async add(instance: Instance, items: unknown, options: LinkOptions = {}): Promise<Instance> {
    await this.#addLinks(instance, items, options, true);
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
    await this.#addLinks(instance, items, options, false);
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
    await this.#addLinks(instance, created, options, true);
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

  // creates the missing junction rows and updates the through attributes of the existing ones (v6:
  // `add` only when one differs, `set` whenever some are given)
  async #addLinks(
    instance: Instance,
    items: unknown,
    options: LinkOptions,
    onlyChanged: boolean,
  ): Promise<void> {
    const given = this.#given(items, options);
    const links = await this.#links(instance, options, [...given.keys()]);
    for (const link of links) {
      const values = given.get(link.get(this.#otherKey)) ?? {};
      if (this.#needsUpdate(link, values, onlyChanged)) {
        await this.#updateLink(instance, link, values, options);
      }
    }
    const existing = new Set(links.map((link) => link.get(this.#otherKey)));
    const missing = [...given].filter(([id]) => !existing.has(id));
    await this.#createLinks(instance, missing, options);
  }

  // junction values by target key: `options.through`, overridden by those set on the item
  #given(items: unknown, options: LinkOptions): ReadonlyMap<unknown, Values> {
    const list = this.toArray(items);
    return new Map(
      this.#ids(items).map((id, index) => {
        const item = list[index];
        const own =
          typeof item === 'object' && item !== null && (item as Values)[this.#junctionName];
        const values = own instanceof this.#junction ? {} : (own as Values);
        return [id, { ...options.through, ...values }];
      }),
    );
  }

  async #createLinks(
    instance: Instance,
    missing: readonly (readonly [unknown, Values])[],
    options: LinkOptions,
  ): Promise<void> {
    if (missing.length > 0) {
      await this.#junction.bulkCreate(
        missing.map(([id, values]) => ({
          ...values,
          ...this.#own(instance),
          [this.#otherKey]: id,
        })) as never,
        { ...this.passThrough(options), validate: true } as never,
      );
    }
  }

  #needsUpdate(link: Instance, values: Values, onlyChanged: boolean): boolean {
    const entries = Object.entries(values);
    return entries.length > 0 && (!onlyChanged || entries.some(([k, v]) => link.get(k) !== v));
  }

  async #updateLink(
    instance: Instance,
    link: Instance,
    values: Values,
    options: LinkOptions,
  ): Promise<void> {
    const where = {
      [this.foreignKey]: instance.get(this.sourceKey),
      [this.#otherKey]: link.get(this.#otherKey),
    };
    await this.#junction.update(values as never, { ...this.passThrough(options), where } as never);
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
