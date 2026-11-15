import type { OnConflictNode } from '../sql/ast.ts';
import { WhereCompiler } from '../where/where.ts';
import type { ModelDefinition } from './definition.ts';
import type { BulkCreateOptions, Values } from './options.ts';
import { whereCompiler } from './query-builders.ts';

export const V6_CONFLICT_OPTIONS = [
  'ignoreDuplicates',
  'updateOnDuplicate',
  'conflictAttributes',
  'conflictWhere',
] as const;

export const fieldsOf = (
  definition: ModelDefinition,
  names: readonly string[],
): readonly string[] => names.map((name) => definition.attributes.get(name)?.field ?? name);

export const firstUniqueKey = (definition: ModelDefinition): readonly string[] | undefined =>
  [...definition.uniqueKeys.values()].find((fields) => fields.length > 0);

type UniqueKey = Readonly<{ fields: readonly string[]; where?: unknown }>;

/** Attribute names (and partial-index predicate) of each unique index declared in `indexes`. */
const uniqueIndexKeys = (definition: ModelDefinition, withPartial: boolean): readonly UniqueKey[] =>
  (definition.options.indexes ?? [])
    .filter((index) => index.unique === true && (withPartial || index.where === undefined))
    .map((index) => ({
      fields: (index.fields ?? []).map((field) => (typeof field === 'string' ? field : field.name)),
      ...(index.where === undefined ? {} : { where: index.where }),
    }))
    .filter((key) => key.fields.length > 0);

export const conflictUpdate = (
  attributes: readonly string[],
  target: readonly string[],
  where?: unknown,
): OnConflictNode => ({
  target: {
    kind: 'columns',
    items: target.map((field) => ({ kind: 'ident', path: [field] }) as const),
    ...(where === undefined ? {} : { where: where as never }),
  },
  action:
    attributes.length === 0
      ? { kind: 'nothing' }
      : {
          kind: 'update',
          set: attributes.map((field) => ({
            column: field,
            value: { kind: 'excluded', column: field } as const,
          })),
        },
});

export const v6BulkConflict = (
  definition: ModelDefinition,
  options: BulkCreateOptions,
): Readonly<{ onConflict?: OnConflictNode }> => {
  if (options.updateOnDuplicate !== undefined) {
    if (options.updateOnDuplicate.length === 0) {
      throw new Error('updateOnDuplicate option only supports non-empty array.');
    }
    const updatable = options.updateOnDuplicate.filter(
      (name) => definition.attributes.has(name) && name !== definition.createdAt,
    );
    const indexed = [
      ...uniqueIndexKeys(definition, false).flatMap((key) => key.fields),
      ...(firstUniqueKey(definition) ?? []),
    ];
    const target =
      options.conflictAttributes ?? (indexed.length > 0 ? indexed : definition.primaryKeys);
    const where =
      options.conflictWhere === undefined || WhereCompiler.isEmpty(options.conflictWhere)
        ? undefined
        : whereCompiler(definition, undefined).compile(options.conflictWhere);
    return {
      onConflict: conflictUpdate(
        fieldsOf(definition, updatable),
        fieldsOf(definition, target),
        where,
      ),
    };
  }
  return options.ignoreDuplicates === true ? { onConflict: { action: { kind: 'nothing' } } } : {};
};

export const v6UpsertConflict = (
  definition: ModelDefinition,
  insertValues: Values,
  updatable: readonly string[],
  conflictFields: readonly string[] | undefined,
): OnConflictNode => {
  const update = [
    ...updatable,
    ...(definition.updatedAt === undefined || updatable.includes(definition.updatedAt)
      ? []
      : [definition.updatedAt]),
  ].filter((name) => name in insertValues);
  const uniqueKeys = [...definition.uniqueKeys.values()]
    .filter((fields) => fields.length > 0)
    .map((fields): UniqueKey => ({ fields }));
  const indexKeys = uniqueIndexKeys(definition, true);
  const found = update
    .map(
      (name) =>
        uniqueKeys.find((key) => key.fields.includes(name)) ??
        indexKeys.find((key) => key.fields.includes(name)),
    )
    .find((key) => key !== undefined);
  const uniqueKey =
    found === undefined || update.some((name) => definition.primaryKeys.includes(name))
      ? undefined
      : found;
  const target =
    conflictFields ?? fieldsOf(definition, uniqueKey?.fields ?? definition.primaryKeys);
  const where =
    conflictFields !== undefined ||
    uniqueKey?.where === undefined ||
    WhereCompiler.isEmpty(uniqueKey.where)
      ? undefined
      : whereCompiler(definition, undefined).compile(uniqueKey.where);
  const assigned = update.filter((name) => definition.attributes.get(name)?.identity !== 'always');
  return conflictUpdate(fieldsOf(definition, assigned), [...new Set(target)], where);
};

export const withoutGeneratedKey = (
  definition: ModelDefinition,
  provided: Values,
  values: Values,
): Values => {
  const key = definition.primaryKeys[0];
  return key !== undefined &&
    !(key in provided) &&
    definition.attributes.get(key)?.defaultValue === undefined
    ? Object.fromEntries(Object.entries(values).filter(([name]) => name !== key))
    : values;
};
