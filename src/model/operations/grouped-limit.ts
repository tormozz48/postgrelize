import { Op } from '../../expressions/op.ts';
import { inflector } from '../inflector.ts';
import { junctionPlurals } from '../junction-plurals.ts';
import { ModelRegistry } from '../model-registry.ts';
import type { AnyModel, ModelStatic, MutableOptions, Values } from '../options.ts';

type Grouping = Readonly<{
  limit: number;
  on: string | Association;
  values: readonly unknown[];
  through?: Readonly<{ where?: unknown }>;
}>;

type Association = Readonly<{
  associationType: string;
  foreignKey: string;
  otherKey?: string;
  sourceKey: string;
  through?: Readonly<{ model: ModelStatic<AnyModel> }>;
}>;

// a row of one group and the junction row that put it there
type Linked = Readonly<{ row: AnyModel; link: AnyModel }>;

// one groupedLimit read: the options of every inner query and how rows are told apart
type Read = Readonly<{ model: ModelStatic<AnyModel>; base: Values; key: string }>;

const registry = new ModelRegistry();

/**
 * The undocumented v6 `groupedLimit` finder option: at most `limit` rows for each of `values`.
 * Like v6, `include` is joined after the rows of every group are picked.
 *
 * @internal
 */
export class GroupedLimit {
  rows(model: ModelStatic<AnyModel>, options: MutableOptions): Promise<unknown[]> {
    const { groupedLimit, ...rest } = options;
    const grouping = groupedLimit as Grouping;
    const { on } = grouping;
    // scopes, hooks and `rejectOnEmpty` belong to the outer call
    const base: Values = { ...rest, hooks: false, plain: false, rejectOnEmpty: false };
    if (typeof on !== 'string' && on.associationType === 'BelongsToMany') {
      return this.#linked({ model, base, key: on.sourceKey }, on, grouping);
    }
    const key = (model as unknown as { primaryKeyAttribute: string }).primaryKeyAttribute;
    return this.#keyed({ model, base, key }, typeof on === 'string' ? on : on.foreignKey, grouping);
  }

  async #keyed(read: Read, attribute: string, { limit, values }: Grouping): Promise<AnyModel[]> {
    if (values.length === 0) {
      return [];
    }
    const picked = await this.#pick(read, { limit, lateralKeys: { attribute, values } });
    if (read.base['include'] === undefined || picked.length === 0) {
      return picked;
    }
    // like v6, the rows stay in the order of their groups
    const rows = await this.#reread(read, picked, undefined);
    return this.#sorted(rows, picked, (row) => this.#value(read, row, read.key));
  }

  async #linked(read: Read, on: Association, grouping: Grouping): Promise<unknown[]> {
    const groups = await Promise.all(
      grouping.values.map((value) => this.#group(read, on, grouping, value)),
    );
    const pairs = groups.flat();
    const key = (row: AnyModel): unknown => this.#value(read, row, read.key);
    const picked = pairs.map(({ row }) => row);
    const { order, include, raw } = read.base;
    const reread =
      pairs.length > 0 && (order !== undefined || include !== undefined)
        ? await this.#reread(read, picked, order)
        : picked;
    const rows = order === undefined ? this.#sorted(reread, picked, key) : reread;
    // like v6, rows list the junction rows under the junction plural; raw rows carry none
    const plural = this.#plural((on.through as NonNullable<Association['through']>).model);
    return raw === true ? rows : this.#nest(plural, rows, pairs, key);
  }

  #plural(junction: ModelStatic<AnyModel>): string {
    const { definition } = registry.state(junction);
    return (
      junctionPlurals.get(junction) ??
      definition.options.name?.plural ??
      inflector.pluralize(definition.name)
    );
  }

  async #group(
    read: Read,
    on: Association,
    { limit, through }: Grouping,
    value: unknown,
  ): Promise<Linked[]> {
    const links = await this.#junctionRows(on, through?.where, value, read.base);
    const byKey = new Map(links.map((link) => [link.get(on.foreignKey), link]));
    if (byKey.size === 0) {
      return [];
    }
    const where = this.#and(read.base['where'], { [read.key]: [...byKey.keys()] });
    const rows = await this.#pick(read, { limit, where });
    return rows.map((row) => ({
      row,
      link: byKey.get(this.#value(read, row, read.key)) as AnyModel,
    }));
  }

  #junctionRows(
    on: Association,
    where: unknown,
    value: unknown,
    { transaction, logging, benchmark, useMaster }: Values,
  ): Promise<AnyModel[]> {
    const junction = (on.through as NonNullable<Association['through']>).model;
    return junction.findAll({
      where: this.#and(where, { [on.otherKey as string]: value }),
      transaction,
      logging,
      benchmark,
      useMaster,
    } as never) as Promise<AnyModel[]>;
  }

  #pick(read: Read, extra: Values): Promise<AnyModel[]> {
    return this.#find(read, { ...extra, include: undefined });
  }

  // the picked rows once more, with their includes or in one order over all groups
  #reread(read: Read, picked: readonly AnyModel[], order: unknown): Promise<AnyModel[]> {
    const keys = picked.map((row) => this.#value(read, row, read.key));
    return this.#find(read, { where: { [read.key]: keys }, order, offset: null });
  }

  #find({ model, base, key }: Read, extra: Values): Promise<AnyModel[]> {
    const { attributes } = base;
    const selected =
      Array.isArray(attributes) && !attributes.includes(key)
        ? { attributes: [key, ...(attributes as unknown[])] }
        : {};
    return model.unscoped().findAll({ ...base, ...selected, ...extra } as never) as Promise<
      AnyModel[]
    >;
  }

  #and(where: unknown, extra: Values): unknown {
    return where === undefined ? extra : { [Op.and]: [where, extra] };
  }

  #value({ base }: Read, row: AnyModel, attribute: string): unknown {
    return base['raw'] === true ? (row as unknown as Values)[attribute] : row.get(attribute);
  }

  // one row per key, in the order the keys were first picked
  #sorted(
    rows: readonly AnyModel[],
    picked: readonly AnyModel[],
    key: (row: AnyModel) => unknown,
  ): AnyModel[] {
    const found = new Map(rows.map((row) => [key(row), row]));
    return [...new Set(picked.map(key))].flatMap((id) => found.get(id) ?? []);
  }

  // every instance lists the junction rows that put it into a group
  #nest(
    as: string,
    rows: readonly AnyModel[],
    pairs: readonly Linked[],
    key: (row: AnyModel) => unknown,
  ): AnyModel[] {
    rows.forEach((row) => {
      (row.dataValues as Values)[as] = pairs
        .filter((pair) => key(pair.row) === key(row))
        .map(({ link }) => link);
    });
    return [...rows];
  }
}
