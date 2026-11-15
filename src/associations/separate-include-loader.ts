import { Op } from '../expressions/op.ts';
import type { AnyModel } from '../model/options.ts';
import { AttributeColumns } from '../model/attribute-columns.ts';
import type { IncludeNode } from './include.ts';
import type { IncludeResolver } from './include-resolver.ts';

const columns = new AttributeColumns();

type Instance = AnyModel;
type Values = Record<string, unknown>;
type FindOptions = Readonly<Record<string, unknown>>;

/** Loads `separate: true` includes with one extra query each. */
export class SeparateIncludeLoader {
  readonly #resolver: IncludeResolver;

  /**
   * @param resolver - Converts include nodes back to options for the separate queries.
   */
  constructor(resolver: IncludeResolver) {
    this.#resolver = resolver;
  }

  /**
   * Loads `separate: true` includes with one extra query each and attaches them, keeping at most
   * `limit` rows per parent.
   *
   * @param parents - Instances the includes belong to.
   * @param includes - Include tree.
   * @param options - Find options (`transaction` is passed on).
   * @returns Resolves when all separate includes are attached.
   */
  async load(
    parents: readonly Instance[],
    includes: readonly IncludeNode[],
    options: FindOptions,
  ): Promise<void> {
    await Promise.all(includes.map((node) => this.#loadNode(parents, node, options)));
  }

  async #loadNode(
    parents: readonly Instance[],
    node: IncludeNode,
    options: FindOptions,
  ): Promise<void> {
    if (!node.separate) {
      await this.load(this.#loaded(parents, node), node.children, options);
      return;
    }
    const keys = [...new Set(parents.map((parent) => parent.get(node.association.sourceKey)))];
    const rows = (await node.model.findAll(
      this.#query(node, keys, options) as never,
    )) as Instance[];
    parents.forEach((parent) => this.#attach(parent, node, rows));
  }

  #loaded(parents: readonly Instance[], node: IncludeNode): Instance[] {
    return parents.flatMap((parent) => {
      const value = (parent.dataValues as Values)[node.as];
      return Array.isArray(value)
        ? (value as Instance[])
        : value === null || value === undefined
          ? []
          : [value as Instance];
    });
  }

  #query(node: IncludeNode, keys: readonly unknown[], options: FindOptions): Values {
    return {
      ...(options['transaction'] === undefined ? {} : { transaction: options['transaction'] }),
      ...this.#scope(node, keys),
      attributes:
        node.attributes ?? columns.stored(node.definition).map((attribute) => attribute.fieldName),
      ...(node.order === undefined ? {} : { order: node.order }),
      ...(node.children.length === 0
        ? {}
        : { include: node.children.map((child) => this.#resolver.toOptions(child)) }),
      paranoid: node.paranoid,
    };
  }

  #scope(node: IncludeNode, keys: readonly unknown[]): Values {
    const own = node.where === undefined ? [] : [node.where];
    if (!node.lateral) {
      return { where: { [Op.and]: [{ [node.association.foreignKey]: keys }, ...own] } };
    }
    if (node.limit === undefined || node.children.length > 0) {
      throw new Error('A lateral include needs a limit and no nested includes');
    }
    return {
      ...(own.length === 0 ? {} : { where: { [Op.and]: own } }),
      limit: node.limit,
      lateralKeys: { attribute: node.association.foreignKey, values: keys },
    };
  }

  #attach(parent: Instance, node: IncludeNode, rows: readonly Instance[]): void {
    const own = rows.filter(
      (row) => row.get(node.association.foreignKey) === parent.get(node.association.sourceKey),
    );
    (parent.dataValues as Values)[node.as] =
      node.limit === undefined ? own : own.slice(0, node.limit);
  }
}
