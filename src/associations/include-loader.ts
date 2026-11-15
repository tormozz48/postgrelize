import { Op } from '../expressions/op.ts';
import type { AttributeDefinition, ModelDefinition } from '../model/model-definition.ts';
import type { AnyModel, ModelStatic } from '../model/options.ts';
import { AttributeColumns } from '../model/attribute-columns.ts';
import { ModelRegistry } from '../model/model-registry.ts';
import type { IncludeNode } from './include.ts';
import type { IncludeResolver } from './include-resolver.ts';

const registry = new ModelRegistry();
const columns = new AttributeColumns();

type Model = ModelStatic<AnyModel>;
type Instance = AnyModel;

/** Result row keyed by column alias (`Posts.title` for included columns). */
export type IncludeRow = Readonly<Record<string, unknown>>;

/** Builds an instance of `model` from loaded values. */
export type InstanceBuilder = (model: Model, values: Readonly<Record<string, unknown>>) => Instance;

const isMulti = (node: IncludeNode): boolean => node.association.isMultiAssociation;

const parseValue = (attribute: AttributeDefinition | undefined, value: unknown): unknown =>
  value === null || value === undefined || attribute?.type.parse === undefined
    ? value
    : attribute.type.parse(value);

const valuesAt = (
  definition: ModelDefinition,
  row: IncludeRow,
  path: string,
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(row)
      .filter(([key]) => key.startsWith(`${path}.`) && !key.slice(path.length + 1).includes('.'))
      .map(([key, value]) => {
        const name = key.slice(path.length + 1);
        return [name, parseValue(definition.attributes.get(name), value)];
      }),
  );

const identity = (
  definition: ModelDefinition,
  values: Readonly<Record<string, unknown>>,
): string | undefined => {
  if (Object.values(values).every((value) => value === null || value === undefined)) {
    return undefined;
  }
  const keys = definition.primaryKeys;
  return keys.length > 0 && keys.every((key) => key in values)
    ? JSON.stringify(keys.map((key) => values[key]))
    : JSON.stringify(Object.entries(values));
};

const flatten = (list: readonly IncludeNode[]): readonly IncludeNode[] =>
  list.flatMap((node) => [node, ...flatten(node.children)]);

/**
 * Turns joined result rows into instance trees (Sequelize v6 de-duplication by primary key),
 * parses raw joined rows, and loads `separate: true` includes with one extra query each.
 */
export class IncludeLoader {
  readonly #resolver: IncludeResolver;

  /**
   * @param resolver - Converts include nodes back to options for the separate queries.
   */
  constructor(resolver: IncludeResolver) {
    this.#resolver = resolver;
  }

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
    const definition = registry.state(model).definition;
    const mainKeys = (row: IncludeRow): Readonly<Record<string, unknown>> =>
      Object.fromEntries(Object.entries(parseMain(row)).filter(([key]) => !key.includes('.')));
    const groups = rows.reduce<Map<string, IncludeRow[]>>((acc, row, index) => {
      const key = identity(definition, mainKeys(row)) ?? `row:${index}`;
      acc.set(key, [...(acc.get(key) ?? []), row]);
      return acc;
    }, new Map());
    return [...groups.values()].map((group) => {
      const instance = build(model, mainKeys(group[0] ?? {}));
      this.#attachChildren(instance, includes, group, build);
      return instance;
    });
  }

  /**
   * Parses a joined raw row: included keys are parsed with the included model's data types.
   *
   * @param includes - Include tree.
   * @param row - Joined row.
   * @param parseMain - Parses a row with the main model's data types.
   * @returns Parsed row.
   */
  parseRawRow(
    includes: readonly IncludeNode[],
    row: IncludeRow,
    parseMain: (row: IncludeRow) => Readonly<Record<string, unknown>>,
  ): Record<string, unknown> {
    const all = flatten(includes);
    const main = parseMain(row);
    return Object.fromEntries(
      Object.entries(main).map(([key, value]) => {
        const dot = key.lastIndexOf('.');
        if (dot < 0) {
          return [key, value];
        }
        const path = key.slice(0, dot);
        const node = all.find((candidate) => candidate.path === path);
        const definition =
          node?.definition ??
          all.find((candidate) => candidate.through?.path === path)?.through?.definition;
        return [key, parseValue(definition?.attributes.get(key.slice(dot + 1)), value)];
      }),
    );
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
  async loadSeparate(
    parents: readonly Instance[],
    includes: readonly IncludeNode[],
    options: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    await Promise.all(
      includes.map(async (node) => {
        if (!node.separate) {
          await this.loadSeparate(
            parents.flatMap((parent) => {
              const value = (parent.dataValues as Record<string, unknown>)[node.as];
              return Array.isArray(value)
                ? (value as Instance[])
                : value === null || value === undefined
                  ? []
                  : [value as Instance];
            }),
            node.children,
            options,
          );
          return;
        }
        const keys = [...new Set(parents.map((parent) => parent.get(node.association.sourceKey)))];
        const rows = (await node.model.findAll({
          ...(options['transaction'] === undefined ? {} : { transaction: options['transaction'] }),
          where: {
            [Op.and]: [
              { [node.association.foreignKey]: keys },
              ...(node.where === undefined ? [] : [node.where]),
            ],
          },
          attributes:
            node.attributes ??
            columns.stored(node.definition).map((attribute) => attribute.fieldName),
          ...(node.order === undefined ? {} : { order: node.order }),
          ...(node.children.length === 0
            ? {}
            : { include: node.children.map((child) => this.#resolver.toOptions(child)) }),
          paranoid: node.paranoid,
        } as never)) as Instance[];
        parents.forEach((parent) => {
          const own = rows.filter(
            (row) =>
              row.get(node.association.foreignKey) === parent.get(node.association.sourceKey),
          );
          (parent.dataValues as Record<string, unknown>)[node.as] =
            node.limit === undefined ? own : own.slice(0, node.limit);
        });
      }),
    );
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
        const groups = rows.reduce<
          Map<string, { values: Record<string, unknown>; rows: IncludeRow[] }>
        >((acc, row) => {
          const values = valuesAt(node.definition, row, node.path);
          const key = identity(node.definition, values);
          if (key !== undefined) {
            const group = acc.get(key);
            if (group === undefined) {
              acc.set(key, { values, rows: [row] });
            } else {
              group.rows.push(row);
            }
          }
          return acc;
        }, new Map());
        const children = [...groups.values()].map((group) => {
          const child = build(node.model, group.values);
          const throughValues =
            node.through === undefined
              ? {}
              : valuesAt(node.through.definition, group.rows[0] ?? {}, node.through.path);
          if (node.through !== undefined && Object.keys(throughValues).length > 0) {
            (child.dataValues as Record<string, unknown>)[node.through.definition.name] = build(
              node.through.model,
              throughValues,
            );
          }
          this.#attachChildren(child, node.children, group.rows, build);
          return child;
        });
        (parent.dataValues as Record<string, unknown>)[node.as] = isMulti(node)
          ? children
          : (children[0] ?? null);
      });
  }
}
