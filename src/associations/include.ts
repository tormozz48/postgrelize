import { EagerLoadingError } from '../errors/errors.ts';
import { isExpression } from '../expressions/methods.ts';
import { Op } from '../expressions/op.ts';
import type { AttributeDefinition, ModelDefinition } from '../model/definition.ts';
import type { AnyModel, ModelStatic } from '../model/options.ts';
import {
  directionOf,
  orderItem,
  selectColumns,
  storedAttributes,
  tableOf,
  whereClause,
  whereContext,
  type FindAttributeOptions,
} from '../model/query-builders.ts';
import { injectScope } from '../model/scopes.ts';
import { activeScope, stateOf } from '../model/state.ts';
import {
  and,
  binary,
  ident,
  raw,
  type ExprNode,
  type JoinNode,
  type OrderNode,
  type SelectNode,
} from '../sql/ast.ts';
import { associationsOf } from './associate.ts';
import type { Association } from './types.ts';

type Model = ModelStatic<AnyModel>;

/** Through-table options of an include. */
export type IncludeThroughOptions = Readonly<{
  /** Junction attributes to select (`[]` for none). */
  attributes?: FindAttributeOptions;
  /** Filter on junction rows. */
  where?: unknown;
}>;

/** One `include` entry (Sequelize v6 `IncludeOptions`). */
export type IncludeOptions = Readonly<{
  /** Associated model. */
  model?: Model;
  /** Alias of the association. */
  as?: string;
  /** Association object or alias. */
  association?: Association | string;
  /** Filter on the included rows; makes the include required unless `required: false`. */
  where?: unknown;
  /** `INNER JOIN` (true) or `LEFT OUTER JOIN` (false). */
  required?: boolean;
  /** `RIGHT OUTER JOIN`. */
  right?: boolean;
  /** Selected attributes. */
  attributes?: FindAttributeOptions;
  /** Nested includes. */
  include?: IncludeOption;
  /** Load a hasMany association with a separate query. */
  separate?: boolean;
  /** Junction options for belongsToMany. */
  through?: IncludeThroughOptions;
  /** Order of a separate include. */
  order?: unknown;
  /** Limit of a separate include. */
  limit?: number;
  /** For paranoid targets: `false` includes soft-deleted rows. */
  paranoid?: boolean;
  /** Include every association (`{ all: true }`). */
  all?: boolean;
}>;

/** `include` option: a model, an alias, include options, or a list of them. */
export type IncludeOption =
  | Model
  | string
  | IncludeOptions
  | readonly (Model | string | IncludeOptions)[];

/** Normalized include. */
export type IncludeNode = Readonly<{
  association: Association;
  model: Model;
  definition: ModelDefinition;
  as: string;
  alias: string;
  path: string;
  where: unknown;
  required: boolean;
  right: boolean;
  attributes: FindAttributeOptions | undefined;
  separate: boolean;
  paranoid: boolean;
  order: unknown;
  limit: number | undefined;
  through:
    | Readonly<{
        model: Model;
        definition: ModelDefinition;
        alias: string;
        path: string;
        attributes: FindAttributeOptions | undefined;
        where: unknown;
      }>
    | undefined;
  children: readonly IncludeNode[];
}>;

const isModel = (value: unknown): value is Model => typeof value === 'function';

const sameModel = (left: Model, right: Model): boolean => stateOf(left) === stateOf(right);

const resolveAssociation = (source: Model, item: IncludeOptions): Association => {
  const associations = associationsOf(source);
  const sourceName = stateOf(source).definition.name;
  if (item.association !== undefined) {
    const association =
      typeof item.association === 'string' ? associations.get(item.association) : item.association;
    if (association === undefined) {
      throw new Error(
        `Association with alias "${String(item.association)}" does not exist on ${sourceName}`,
      );
    }
    return association;
  }
  if (item.as !== undefined) {
    const association = associations.get(item.as);
    if (
      association === undefined ||
      (item.model !== undefined && !sameModel(association.target, item.model))
    ) {
      const targetName = item.model === undefined ? item.as : stateOf(item.model).definition.name;
      throw new Error(
        `${targetName} is associated to ${sourceName} using an alias. You've included an alias (${item.as}), but it does not match the alias(es) defined in your association.`,
      );
    }
    return association;
  }
  const candidates = [...associations.values()].filter(
    (association) => item.model !== undefined && sameModel(association.target, item.model),
  );
  const targetName = item.model === undefined ? '?' : stateOf(item.model).definition.name;
  if (candidates.length === 0) {
    throw new EagerLoadingError(`${targetName} is not associated to ${sourceName}!`);
  }
  if (candidates.length > 1) {
    throw new Error(
      `${targetName} is associated to ${sourceName} multiple times. To identify the correct association, you must use the 'as' keyword to specify the alias of the association you want to include.`,
    );
  }
  return candidates[0] as Association;
};

const toOptions = (item: Model | string | IncludeOptions): IncludeOptions =>
  isModel(item) ? { model: item } : typeof item === 'string' ? { association: item } : item;

const expandAll = (source: Model, items: readonly IncludeOptions[]): readonly IncludeOptions[] =>
  items.flatMap((item): readonly IncludeOptions[] =>
    item.all === true
      ? [...associationsOf(source).values()].map((association): IncludeOptions => ({ association }))
      : [item],
  );

/**
 * Merges the scope of the included model into the include options like Sequelize v6
 * `_injectScope`: a scoped class given as `model` brings its scopes, otherwise the target's
 * default scope applies. Include options win.
 */
const withTargetScope = (item: IncludeOptions, target: Model): IncludeOptions => {
  const scoped = item.model ?? target;
  return injectScope(
    activeScope(scoped),
    item as Readonly<Record<string, unknown>>,
    stateOf(scoped).scopes.whereMergeStrategy,
  ) as IncludeOptions;
};

/** Normalizes the `include` option of `source` into an include tree. */
export const normalizeIncludes = (
  source: Model,
  option: IncludeOption | undefined,
  parentAlias = '',
  parentPath = '',
): readonly IncludeNode[] => {
  if (option === undefined) {
    return [];
  }
  const items = expandAll(source, (Array.isArray(option) ? option : [option]).map(toOptions));
  return items.map((unscoped) => {
    const association = resolveAssociation(source, unscoped);
    const model = association.target;
    const item = withTargetScope(unscoped, model);
    const alias = parentAlias === '' ? association.as : `${parentAlias}->${association.as}`;
    const path = parentPath === '' ? association.as : `${parentPath}.${association.as}`;
    const through =
      association.through === undefined
        ? undefined
        : {
            model: association.through.model,
            definition: stateOf(association.through.model).definition,
            alias: `${alias}->${stateOf(association.through.model).definition.name}`,
            path: `${path}.${stateOf(association.through.model).definition.name}`,
            attributes: item.through?.attributes,
            where: item.through?.where,
          };
    return {
      association,
      model,
      definition: stateOf(model).definition,
      as: association.as,
      alias,
      path,
      where: item.where,
      required: item.required ?? item.where !== undefined,
      right: item.right === true,
      attributes: item.attributes,
      separate: item.separate === true && association.associationType === 'HasMany',
      paranoid: item.paranoid !== false,
      order: item.order,
      limit: item.limit,
      through,
      children: normalizeIncludes(model, item.include, alias, path),
    };
  });
};

const isMulti = (node: IncludeNode): boolean => node.association.isMultiAssociation;

const field = (definition: ModelDefinition, name: string): string =>
  definition.attributes.get(name)?.field ?? name;

const prefixColumns = (
  definition: ModelDefinition,
  alias: string,
  path: string,
  attributes: FindAttributeOptions | undefined,
): readonly ExprNode[] =>
  selectColumns(definition, alias, whereContext(definition, alias), attributes).map((column) => {
    const name =
      column.kind === 'alias'
        ? column.alias
        : column.kind === 'ident'
          ? (definition.fieldToAttribute.get(column.path.at(-1) ?? '') ?? column.path.at(-1) ?? '')
          : '';
    const expr = column.kind === 'alias' ? column.expr : column;
    return { kind: 'alias', expr, alias: `${path}.${name}` } as const;
  });

const conditionFor = (
  definition: ModelDefinition,
  alias: string,
  where: unknown,
  paranoid: boolean,
): ExprNode | undefined => {
  const condition = whereClause(where, whereContext(definition, alias));
  const notDeleted =
    paranoid && definition.deletedAt !== undefined
      ? ({
          kind: 'postfix',
          op: 'IS NULL',
          expr: ident(alias, field(definition, definition.deletedAt)),
        } as const)
      : undefined;
  const parts = [condition, notDeleted].filter((part): part is ExprNode => part !== undefined);
  return parts.length === 0 ? undefined : and(parts);
};

const scopeCondition = (
  definition: ModelDefinition,
  alias: string,
  scope: Readonly<Record<string, unknown>> | undefined,
): ExprNode | undefined =>
  scope === undefined ? undefined : whereClause(scope, whereContext(definition, alias));

const joinType = (node: IncludeNode, required: boolean): JoinNode['type'] =>
  node.right ? 'RIGHT OUTER' : required ? 'INNER' : 'LEFT OUTER';

const onClause = (parent: ModelDefinition, parentAlias: string, node: IncludeNode): ExprNode => {
  const { association } = node;
  return association.associationType === 'BelongsTo'
    ? binary(
        '=',
        ident(parentAlias, field(parent, association.foreignKey)),
        ident(node.alias, field(node.definition, association.targetKey)),
      )
    : binary(
        '=',
        ident(parentAlias, field(parent, association.sourceKey)),
        ident(node.alias, field(node.definition, association.foreignKey)),
      );
};

const joinsFor = (
  parent: ModelDefinition,
  parentAlias: string,
  node: IncludeNode,
): readonly JoinNode[] => {
  const extra = [
    conditionFor(node.definition, node.alias, node.where, node.paranoid),
    scopeCondition(node.definition, node.alias, node.association.scope),
  ];
  const through = node.through;
  if (through === undefined) {
    return [
      {
        type: joinType(node, node.required),
        table: tableOf(node.definition, node.alias),
        on: and([
          onClause(parent, parentAlias, node),
          ...extra.filter((part): part is ExprNode => part !== undefined),
        ]),
      },
      ...node.children
        .filter((child) => !child.separate)
        .flatMap((child) => joinsFor(node.definition, node.alias, child)),
    ];
  }
  const throughCondition = [
    binary(
      '=',
      ident(parentAlias, field(parent, node.association.sourceKey)),
      ident(through.alias, field(through.definition, node.association.foreignKey)),
    ),
    whereClause(through.where, whereContext(through.definition, through.alias)),
    scopeCondition(through.definition, through.alias, node.association.through?.scope),
  ].filter((part): part is ExprNode => part !== undefined);
  return [
    {
      type: joinType(node, node.required),
      table: tableOf(through.definition, through.alias),
      on: and(throughCondition),
    },
    {
      type: joinType(node, node.required),
      table: tableOf(node.definition, node.alias),
      on: and([
        binary(
          '=',
          ident(node.alias, field(node.definition, node.association.targetKey)),
          ident(through.alias, field(through.definition, node.association.otherKey ?? '')),
        ),
        ...extra.filter((part): part is ExprNode => part !== undefined),
      ]),
    },
    ...node.children
      .filter((child) => !child.separate)
      .flatMap((child) => joinsFor(node.definition, node.alias, child)),
  ];
};

const columnsFor = (node: IncludeNode): readonly ExprNode[] => [
  ...prefixColumns(node.definition, node.alias, node.path, node.attributes),
  ...(node.through === undefined
    ? []
    : prefixColumns(
        node.through.definition,
        node.through.alias,
        node.through.path,
        node.through.attributes,
      )),
  ...node.children.filter((child) => !child.separate).flatMap(columnsFor),
];

const findNode = (nodes: readonly IncludeNode[], reference: unknown): IncludeNode | undefined =>
  nodes.find((node) =>
    typeof reference === 'string'
      ? node.as === reference
      : isModel(reference)
        ? node.model === reference
        : typeof reference === 'object' && reference !== null && 'model' in reference
          ? node.model === (reference as IncludeOptions).model &&
            ((reference as IncludeOptions).as === undefined ||
              node.as === (reference as IncludeOptions).as)
          : false,
  );

const includeOrder = (
  includes: readonly IncludeNode[],
  item: readonly unknown[],
): OrderNode | undefined => {
  const directionIndex = item.length - 1;
  const hasDirection =
    typeof item[directionIndex] === 'string' &&
    (() => {
      try {
        directionOf(item[directionIndex]);
        return true;
      } catch {
        return false;
      }
    })();
  const parts = hasDirection ? item.slice(0, -1) : item;
  const attribute = parts.at(-1);
  const references = parts.slice(0, -1);
  if (references.length === 0 || typeof attribute !== 'string') {
    return undefined;
  }
  const node = references.reduce<{ nodes: readonly IncludeNode[]; node: IncludeNode | undefined }>(
    (acc, reference) => {
      const found = findNode(acc.nodes, reference);
      return { nodes: found?.children ?? [], node: found };
    },
    { nodes: includes, node: undefined },
  ).node;
  if (node === undefined) {
    return undefined;
  }
  return {
    expr: ident(node.alias, field(node.definition, attribute)),
    ...(hasDirection ? directionOf(item[directionIndex]) : {}),
  };
};

const orderNodes = (
  definition: ModelDefinition,
  includes: readonly IncludeNode[],
  order: unknown,
  mainAlias: string,
): Readonly<{ all: readonly OrderNode[]; main: readonly OrderNode[] }> => {
  if (order === undefined || order === null) {
    return { all: [], main: [] };
  }
  const ctx = whereContext(definition, mainAlias);
  const items: readonly unknown[] = Array.isArray(order) ? order : [order];
  const resolved = items.map((item) => {
    const viaInclude =
      Array.isArray(item) && item.length > 2
        ? includeOrder(includes, item)
        : Array.isArray(item) &&
            item.length === 2 &&
            typeof item[0] !== 'string' &&
            !isExpression(item[0])
          ? includeOrder(includes, item)
          : undefined;
    return viaInclude === undefined
      ? {
          node: isExpression(item)
            ? { expr: whereClause(item, ctx) ?? raw('1') }
            : orderItem(definition, mainAlias, ctx, item),
          main: true,
        }
      : { node: viaInclude, main: false };
  });
  return {
    all: resolved.map((entry) => entry.node),
    main: resolved.filter((entry) => entry.main).map((entry) => entry.node),
  };
};

/** True when `include` with `limit` requires the v6 sub-query form. */
const aliasesOf = (nodes: readonly IncludeNode[]): readonly string[] =>
  nodes.flatMap((node) => [node.alias, ...aliasesOf(node.children)]);

/** True when a condition references a joined include (`$Include.attr$`) as a table. */
const referencesIncludes = (where: ExprNode | undefined, includes: readonly IncludeNode[]) => {
  if (where === undefined) {
    return false;
  }
  const text = JSON.stringify(where);
  return aliasesOf(includes).some((alias) => text.includes(`"path":[${JSON.stringify(alias)},`));
};

/**
 * Whether `limit`/`offset` must go into a subquery of the main table (v6 rules). A top-level
 * `where` that references a joined include cannot run inside that subquery, so it disables it.
 */
export const needsSubQuery = (
  includes: readonly IncludeNode[],
  options: Readonly<{ limit?: number | null; offset?: number | null; subQuery?: boolean }>,
  where?: ExprNode,
): boolean =>
  options.subQuery !== false &&
  !referencesIncludes(where, includes) &&
  ((options.limit !== undefined && options.limit !== null) ||
    (options.offset !== undefined && options.offset !== null)) &&
  includes.some(
    (node) => !node.separate && (isMulti(node) || node.children.some((child) => isMulti(child))),
  );

const existsFilter = (
  parent: ModelDefinition,
  parentAlias: string,
  node: IncludeNode,
): ExprNode => {
  const joins = joinsFor(parent, parentAlias, {
    ...node,
    children: node.children.filter((child) => child.required),
    required: true,
  });
  const [first, ...rest] = joins;
  if (first === undefined) {
    return raw('TRUE');
  }
  const query: SelectNode = {
    kind: 'select',
    columns: [raw('1')],
    from: first.table,
    ...(rest.length === 0 ? {} : { joins: rest }),
    where: first.on,
  };
  return { kind: 'prefix', op: 'EXISTS', expr: { kind: 'subquery', query } };
};

/** Adds joins, include columns and include ordering to a SELECT built for the main model. */
export const withIncludes = (
  definition: ModelDefinition,
  base: SelectNode,
  includes: readonly IncludeNode[],
  options: Readonly<{
    order?: unknown;
    limit?: number | null;
    offset?: number | null;
    subQuery?: boolean;
  }>,
): SelectNode => {
  const alias = definition.name;
  const joined = includes.filter((node) => !node.separate);
  const order = orderNodes(definition, joined, options.order, alias);
  if (!needsSubQuery(joined, options, base.where)) {
    return {
      ...base,
      columns: [...base.columns, ...joined.flatMap(columnsFor)],
      joins: joined.flatMap((node) => joinsFor(definition, alias, node)),
      orderBy: order.all,
    };
  }
  const requiredFilters = joined
    .filter((node) => node.required)
    .map((node) => existsFilter(definition, alias, node));
  const inner: SelectNode = {
    ...base,
    columns: [...base.columns, ...missingKeyColumns(definition, alias, base.columns, joined)],
    ...(base.where === undefined && requiredFilters.length === 0
      ? {}
      : { where: and([...(base.where === undefined ? [] : [base.where]), ...requiredFilters]) }),
    orderBy: order.main,
  };
  return {
    kind: 'select',
    columns: [{ kind: 'star', table: alias }, ...joined.flatMap(columnsFor)],
    from: { subquery: inner, alias },
    joins: joined.flatMap((node) => joinsFor(definition, alias, node)),
    orderBy: order.all,
    ...(base.lock === undefined ? {} : { lock: base.lock }),
  };
};

const parentKey = (node: IncludeNode): string =>
  node.association.associationType === 'BelongsTo'
    ? node.association.foreignKey
    : node.association.sourceKey;

const selectsField = (column: ExprNode, name: string, fieldName: string): boolean =>
  column.kind === 'star' ||
  (column.kind === 'ident' && column.path.at(-1) === fieldName) ||
  (column.kind === 'alias' && column.alias === name);

/** Join keys of the main table that the subquery must expose for the outer joins. */
const missingKeyColumns = (
  definition: ModelDefinition,
  alias: string,
  columns: readonly ExprNode[],
  joined: readonly IncludeNode[],
): readonly ExprNode[] =>
  [...new Set(joined.map(parentKey))]
    .filter(
      (name) => !columns.some((column) => selectsField(column, name, field(definition, name))),
    )
    .map((name) => ident(alias, field(definition, name)));

/** Joins for `count` with includes (no include columns). */
export const countJoins = (
  definition: ModelDefinition,
  includes: readonly IncludeNode[],
): readonly JoinNode[] =>
  includes
    .filter((node) => !node.separate)
    .flatMap((node) => joinsFor(definition, definition.name, node));

type Row = Readonly<Record<string, unknown>>;

const parseValue = (attribute: AttributeDefinition | undefined, value: unknown): unknown =>
  value === null || value === undefined || attribute?.type.parse === undefined
    ? value
    : attribute.type.parse(value);

const valuesAt = (definition: ModelDefinition, row: Row, path: string): Record<string, unknown> =>
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

type Instance = AnyModel;

type Build = (model: Model, values: Readonly<Record<string, unknown>>) => Instance;

const attachChildren = (
  parent: Instance,
  nodes: readonly IncludeNode[],
  rows: readonly Row[],
  build: Build,
): void => {
  nodes
    .filter((node) => !node.separate)
    .forEach((node) => {
      const groups = rows.reduce<Map<string, { values: Record<string, unknown>; rows: Row[] }>>(
        (acc, row) => {
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
        },
        new Map(),
      );
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
        attachChildren(child, node.children, group.rows, build);
        return child;
      });
      (parent.dataValues as Record<string, unknown>)[node.as] = isMulti(node)
        ? children
        : (children[0] ?? null);
    });
};

/** Groups joined rows into instance trees (Sequelize v6 de-duplication by primary key). */
export const assembleInstances = (
  model: Model,
  includes: readonly IncludeNode[],
  rows: readonly Row[],
  parseMain: (row: Row) => Readonly<Record<string, unknown>>,
  build: Build,
): readonly Instance[] => {
  const definition = stateOf(model).definition;
  const mainKeys = (row: Row): Readonly<Record<string, unknown>> =>
    Object.fromEntries(Object.entries(parseMain(row)).filter(([key]) => !key.includes('.')));
  const groups = rows.reduce<Map<string, Row[]>>((acc, row, index) => {
    const key = identity(definition, mainKeys(row)) ?? `row:${index}`;
    acc.set(key, [...(acc.get(key) ?? []), row]);
    return acc;
  }, new Map());
  return [...groups.values()].map((group) => {
    const instance = build(model, mainKeys(group[0] ?? {}));
    attachChildren(instance, includes, group, build);
    return instance;
  });
};

/** Parses joined raw rows: included keys are parsed with the included model's data types. */
export const parseRawRow = (
  includes: readonly IncludeNode[],
  row: Row,
  parseMain: (row: Row) => Readonly<Record<string, unknown>>,
): Record<string, unknown> => {
  const nodes = (list: readonly IncludeNode[]): readonly IncludeNode[] =>
    list.flatMap((node) => [node, ...nodes(node.children)]);
  const all = nodes(includes);
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
};

/** Loads `separate: true` includes with one extra query each and attaches them. */
export const loadSeparate = async (
  parents: readonly Instance[],
  includes: readonly IncludeNode[],
  options: Readonly<Record<string, unknown>>,
): Promise<void> => {
  await Promise.all(
    includes.map(async (node) => {
      if (!node.separate) {
        await loadSeparate(
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
          storedAttributes(node.definition).map((attribute) => attribute.fieldName),
        ...(node.order === undefined ? {} : { order: node.order }),
        ...(node.children.length === 0 ? {} : { include: node.children.map(toIncludeOptions) }),
        paranoid: node.paranoid,
      } as never)) as Instance[];
      parents.forEach((parent) => {
        const own = rows.filter(
          (row) => row.get(node.association.foreignKey) === parent.get(node.association.sourceKey),
        );
        (parent.dataValues as Record<string, unknown>)[node.as] =
          node.limit === undefined ? own : own.slice(0, node.limit);
      });
    }),
  );
};

/** @internal Converts an include node back to include options. */
export const toIncludeOptions = (node: IncludeNode): IncludeOptions => ({
  association: node.association,
  required: node.required,
  separate: node.separate,
  paranoid: node.paranoid,
  ...(node.where === undefined ? {} : { where: node.where }),
  ...(node.attributes === undefined ? {} : { attributes: node.attributes }),
  ...(node.children.length === 0 ? {} : { include: node.children.map(toIncludeOptions) }),
});
