import { ModelRegistry } from '../model/model-registry.ts';
import type { ModelDefinition } from '../model/model-definition.ts';
import type { AnyModel, ModelStatic } from '../model/options.ts';
import type { IncludeNode } from './include.ts';
import { ValuesWriter } from '../model/values-writer.ts';
import { IncludeRows, type IncludeRow, type InstanceBuilder } from './include-rows.ts';

const registry = new ModelRegistry();

type Model = ModelStatic<AnyModel>;
type Instance = AnyModel;
type Values = Record<string, unknown>;
type Group = Readonly<{ values: Values; rows: IncludeRow[] }>;

/** Groups joined result rows into instance trees (Sequelize v6 de-duplication by primary key). */
export class IncludeAssembler {
  readonly #rows = new IncludeRows();
  readonly #writer = new ValuesWriter();

  /**
   * Groups joined rows into instance trees.
   *
   * @param model - Main model.
   * @param includes - Include tree.
   * @param rows - Joined rows.
   * @param parseMain - Parses a row with the main model's data types.
   * @param build - Builds an instance from loaded values.
   * @returns Main instances with the included instances attached.
   */
  assemble(
    model: Model,
    includes: readonly IncludeNode[],
    rows: readonly IncludeRow[],
    parseMain: (row: IncludeRow) => Readonly<Record<string, unknown>>,
    build: InstanceBuilder,
  ): readonly Instance[] {
    const mainKeys = (row: IncludeRow): Values => this.#mainValues(parseMain(row));
    const groups = this.#groupMain(
      registry.state(model).definition,
      rows,
      mainKeys,
      IncludeAssembler.#hasMultiAssociation(includes),
    );
    return [...groups.values()].map((group) => {
      const instance = build(model, group.values);
      this.#attachChildren(instance, includes, group.rows, build);
      return instance;
    });
  }

  #mainValues(parsed: Readonly<Record<string, unknown>>): Values {
    const values: Values = {};
    for (const key of Object.keys(parsed)) {
      if (!key.includes('.')) {
        this.#writer.set(values, key, parsed[key]);
      }
    }
    return values;
  }

  #groupMain(
    definition: ModelDefinition,
    rows: readonly IncludeRow[],
    mainKeys: (row: IncludeRow) => Values,
    hasMulti: boolean,
  ): Map<string | number, Group> {
    const groups = new Map<string | number, Group>();
    for (const [index, row] of rows.entries()) {
      const values = mainKeys(row);
      const key =
        (hasMulti ? this.#rows.identity(definition, values) : undefined) ?? `row:${index}`;
      const group = groups.get(key);
      if (group === undefined) {
        groups.set(key, { values, rows: [row] });
      } else {
        group.rows.push(row);
      }
    }
    return groups;
  }

  // v6 collapses main rows only when some include fans a row out (hasMultiAssociation); otherwise
  // every row is its own instance, whatever was selected.
  static #hasMultiAssociation(nodes: readonly IncludeNode[]): boolean {
    return nodes.some(
      (node) =>
        !node.separate &&
        (node.association.isMultiAssociation ||
          IncludeAssembler.#hasMultiAssociation(node.children)),
    );
  }

  #groupNode(node: IncludeNode, rows: readonly IncludeRow[]): Map<string | number, Group> {
    return rows.reduce<Map<string | number, Group>>((acc, row) => {
      const values = this.#rows.valuesAt(node.definition, row, node.path);
      const key = this.#rows.identity(node.definition, values);
      const group = key === undefined ? undefined : acc.get(key);
      if (key !== undefined && group === undefined) {
        acc.set(key, { values, rows: [row] });
      } else {
        group?.rows.push(row);
      }
      return acc;
    }, new Map());
  }

  #attachChildren(
    parent: Instance,
    nodes: readonly IncludeNode[],
    rows: readonly IncludeRow[],
    build: InstanceBuilder,
  ): void {
    nodes
      .filter((node) => !node.separate)
      .forEach((node) => {
        const children = [...this.#groupNode(node, rows).values()].map((group) =>
          this.#child(node, group, build),
        );
        (parent.dataValues as Values)[node.as] = node.association.isMultiAssociation
          ? children
          : (children[0] ?? null);
      });
  }

  #child(node: IncludeNode, group: Group, build: InstanceBuilder): Instance {
    const child = build(node.model, group.values);
    this.#attachThrough(child, node, group.rows[0] ?? {}, build);
    this.#attachChildren(child, node.children, group.rows, build);
    return child;
  }

  #attachThrough(
    child: Instance,
    node: IncludeNode,
    row: IncludeRow,
    build: InstanceBuilder,
  ): void {
    const { through } = node;
    const values =
      through === undefined ? {} : this.#rows.valuesAt(through.definition, row, through.path);
    if (through !== undefined && Object.keys(values).length > 0) {
      (child.dataValues as Values)[through.definition.name] = build(through.model, values);
    }
  }
}
