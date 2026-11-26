import { ModelValues } from '../model/model-values.ts';
import type { AnyModel, BulkCreateOptions, ModelStatic, Values } from '../model/options.ts';
import type { IncludeNode } from './include.ts';
import type { IncludeResolver } from './include-resolver.ts';

/** Bulk creates `instances` of `model`; the operation hands itself in so nested levels recurse. */
export type BulkRun = (
  model: ModelStatic<AnyModel>,
  instances: AnyModel[],
  options: BulkCreateOptions,
) => Promise<AnyModel[]>;

type Pair = Readonly<{ parent: AnyModel; child: AnyModel }>;

const modelValues = new ModelValues();

/**
 * Creates the nested records of `Model.bulkCreate` with `include` the way Sequelize v6 does: one
 * nested `bulkCreate` per include (belongsTo parents before the instances, hasOne / hasMany /
 * belongsToMany children after them, then the junction rows), each handed the options of its
 * include entry plus `transaction` and `logging`.
 */
export class NestedBulkCreator {
  readonly #resolver: IncludeResolver;
  readonly #isInstance: (value: unknown) => value is AnyModel;

  /**
   * @param resolver - Turns include nodes back into include options for the nested level.
   * @param isInstance - Checks whether a value is a model instance.
   */
  constructor(resolver: IncludeResolver, isInstance: (value: unknown) => value is AnyModel) {
    this.#resolver = resolver;
    this.#isInstance = isInstance;
  }

  /**
   * Creates the belongsTo parents of `instances` and sets their foreign keys.
   *
   * @param instances - Instances being created.
   * @param nodes - Include tree.
   * @param options - Options of the bulk create.
   * @param run - Nested bulk create.
   * @returns Resolves when the parents exist.
   */
  async parents(
    instances: readonly AnyModel[],
    nodes: readonly IncludeNode[],
    options: BulkCreateOptions,
    run: BulkRun,
  ): Promise<void> {
    for (const node of nodes.filter((item) => item.association.associationType === 'BelongsTo')) {
      const pairs = this.#pairs(instances, node);
      if (pairs.length > 0) {
        await run(
          node.model,
          pairs.map((pair) => pair.child),
          this.#options(node, options),
        );
        const { foreignKey, targetKey } = node.association;
        pairs.forEach(({ parent, child }) => parent.set(foreignKey, child.get(targetKey)));
      }
    }
  }

  /**
   * Creates the hasOne / hasMany / belongsToMany children of `instances` and the junction rows.
   *
   * @param instances - Created instances.
   * @param nodes - Include tree.
   * @param options - Options of the bulk create.
   * @param run - Nested bulk create.
   * @returns Resolves when the children exist.
   */
  async children(
    instances: readonly AnyModel[],
    nodes: readonly IncludeNode[],
    options: BulkCreateOptions,
    run: BulkRun,
  ): Promise<void> {
    for (const node of nodes.filter((item) => item.association.associationType !== 'BelongsTo')) {
      const pairs = this.#pairs(instances, node);
      if (pairs.length > 0) {
        await this.#create(pairs, node, options, run);
      }
    }
  }

  // hasOne / hasMany children get the foreign key of their parent and the association scope
  #link(pairs: readonly Pair[], node: IncludeNode): void {
    const { association } = node;
    if (association.through === undefined) {
      pairs.forEach(({ parent, child }) =>
        child.set({
          ...association.scope,
          [association.foreignKey]: parent.get(association.sourceKey),
        }),
      );
    }
  }

  async #create(
    pairs: readonly Pair[],
    node: IncludeNode,
    options: BulkCreateOptions,
    run: BulkRun,
  ): Promise<void> {
    this.#link(pairs, node);
    await run(
      node.model,
      pairs.map((pair) => pair.child),
      this.#options(node, options),
    );
    await this.#junction(pairs, node, options, run);
  }

  #pairs(instances: readonly AnyModel[], node: IncludeNode): readonly Pair[] {
    return instances.flatMap((parent) => {
      const value = (parent.dataValues as Values)[node.as];
      const nested: readonly unknown[] = Array.isArray(value) ? value : [value];
      return nested.filter(this.#isInstance).map((child) => ({ parent, child }));
    });
  }

  #options(node: IncludeNode, options: BulkCreateOptions): BulkCreateOptions {
    return {
      ...modelValues.queryOptions(options),
      ...node.custom,
      ...(node.children.length === 0
        ? {}
        : { include: node.children.map((child) => this.#resolver.toOptions(child)) }),
    } as BulkCreateOptions;
  }

  async #junction(
    pairs: readonly Pair[],
    node: IncludeNode,
    options: BulkCreateOptions,
    run: BulkRun,
  ): Promise<void> {
    const { through } = node;
    if (through !== undefined) {
      const instances = this.#junctionRows(pairs, node).map(
        (row) => new through.model(row, { isNewRecord: true }),
      );
      await run(through.model, instances, {
        ...modelValues.queryOptions(options),
        ...node.custom,
      } as BulkCreateOptions);
    }
  }

  #junctionRows(pairs: readonly Pair[], node: IncludeNode): readonly Values[] {
    const { association } = node;
    return pairs.map(({ parent, child }) => ({
      ...this.#throughValues(child, node),
      ...association.through?.scope,
      [association.foreignKey]: parent.get(association.sourceKey),
      [association.otherKey ?? '']: child.get(association.targetKey),
    }));
  }

  // values the child carries for its junction row (`child[ThroughModel]`), without generated columns
  #throughValues(child: AnyModel, node: IncludeNode): Values {
    const { through, association } = node;
    const carried =
      through === undefined ? undefined : (child.dataValues as Values)[through.definition.name];
    const values = this.#isInstance(carried)
      ? (carried.dataValues as Values)
      : ((carried ?? {}) as Values);
    return Object.fromEntries(
      Object.entries(values).filter(
        ([name, value]) =>
          value !== undefined &&
          name !== association.foreignKey &&
          name !== association.otherKey &&
          through?.definition.attributes.get(name)?._autoGenerated !== true,
      ),
    );
  }
}
