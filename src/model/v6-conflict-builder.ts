import { SqlExpression } from '../expressions/expression.ts';
import type { ConflictTarget, ExprNode, OnConflictNode } from '../sql/ast.ts';
import { WhereCompiler } from '../where/where.ts';
import type { AttributeColumns } from './attribute-columns.ts';
import { ModelIndexes } from './model-indexes.ts';
import type { ModelDefinition } from './model-definition.ts';
import type { BulkCreateOptions, Values } from './options.ts';

const modelIndexes = new ModelIndexes();

type UniqueKey = Readonly<{ fields: readonly string[]; where?: unknown }>;

const fieldsOf = (definition: ModelDefinition, names: readonly string[]): readonly string[] =>
  names.map((name) => definition.attributes.get(name)?.field ?? name);

const firstUniqueKey = (definition: ModelDefinition): readonly string[] | undefined =>
  [...definition.uniqueKeys.values()].find((fields) => fields.length > 0);

/** Attribute names (and partial-index predicate) of each unique index declared in `indexes`. */
const uniqueIndexKeys = (definition: ModelDefinition, withPartial: boolean): readonly UniqueKey[] =>
  modelIndexes
    .of(definition)
    // like v6, any truthy `unique` (a name string too) makes a unique index
    .filter((index) => Boolean(index.unique) && (withPartial || index.where === undefined))
    .filter((index) =>
      (index.fields ?? []).every(
        (field) =>
          typeof field === 'string' ||
          (!(field instanceof SqlExpression) && field.name !== undefined),
      ),
    )
    .map((index) => ({
      fields: (index.fields ?? []).map((field) =>
        typeof field === 'string' ? field : ((field as { name?: string }).name as string),
      ),
      ...(index.where === undefined ? {} : { where: index.where }),
    }))
    .filter((key) => key.fields.length > 0);

const columnsTarget = (target: readonly string[], where: ExprNode | undefined): ConflictTarget => ({
  kind: 'columns',
  items: target.map((field) => ({ kind: 'ident', path: [field] }) as const),
  ...(where === undefined ? {} : { where }),
});

const conflictUpdate = (
  attributes: readonly string[],
  target: readonly string[],
  where?: ExprNode,
): OnConflictNode => ({
  target: columnsTarget(target, where),
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

/**
 * Translates the Sequelize v6 conflict rules into ON CONFLICT clauses: `bulkCreate`
 * (`ignoreDuplicates`, `updateOnDuplicate`, `conflictAttributes`, `conflictWhere`) and `upsert`
 * (conflict target from unique keys / indexes).
 */
export class V6ConflictBuilder {
  readonly #columns: AttributeColumns;

  /**
   * @param columns - Attribute to column mapping.
   */
  constructor(columns: AttributeColumns) {
    this.#columns = columns;
  }

  /**
   * ON CONFLICT clause of Sequelize v6 `bulkCreate` options.
   *
   * @param definition - Model definition.
   * @param options - `updateOnDuplicate`, `conflictAttributes`, `conflictWhere`, `ignoreDuplicates`.
   * @returns `{ onConflict }`, or `{}` without conflict handling.
   * @throws Error for an empty `updateOnDuplicate`.
   */
  bulk(
    definition: ModelDefinition,
    options: BulkCreateOptions,
  ): Readonly<{ onConflict?: OnConflictNode }> {
    if (options.updateOnDuplicate !== undefined) {
      return {
        onConflict: this.#updateOnDuplicate(definition, options, options.updateOnDuplicate),
      };
    }
    return options.ignoreDuplicates === true ? { onConflict: { action: { kind: 'nothing' } } } : {};
  }

  /**
   * ON CONFLICT clause of Sequelize v6 `upsert`.
   *
   * @param definition - Model definition.
   * @param insertValues - Inserted values.
   * @param updatable - Attributes updated on conflict.
   * @param conflictFields - `conflictFields` option (column names).
   * @returns ON CONFLICT node.
   */
  upsert(
    definition: ModelDefinition,
    insertValues: Values,
    updatable: readonly string[],
    conflictFields: readonly string[] | undefined,
  ): OnConflictNode {
    const update = V6ConflictBuilder.#upsertUpdate(definition, insertValues, updatable);
    const uniqueKey = V6ConflictBuilder.#upsertKey(definition, update);
    const target =
      conflictFields ?? fieldsOf(definition, uniqueKey?.fields ?? definition.primaryKeys);
    const where =
      conflictFields === undefined ? this.#compile(definition, uniqueKey?.where) : undefined;
    const assigned = update.filter(
      (name) => definition.attributes.get(name)?.identity !== 'always',
    );
    return conflictUpdate(fieldsOf(definition, assigned), [...new Set(target)], where);
  }

  #updateOnDuplicate(
    definition: ModelDefinition,
    options: BulkCreateOptions,
    updateOnDuplicate: readonly string[],
  ): OnConflictNode {
    if (updateOnDuplicate.length === 0) {
      throw new Error('updateOnDuplicate option only supports non-empty array.');
    }
    const updatable = updateOnDuplicate.filter(
      (name) => definition.attributes.has(name) && name !== definition.createdAt,
    );
    const indexed = [
      ...uniqueIndexKeys(definition, false).flatMap((key) => key.fields),
      ...(firstUniqueKey(definition) ?? []),
    ];
    const target =
      options.conflictAttributes ?? (indexed.length > 0 ? indexed : definition.primaryKeys);
    const where = this.#compile(definition, options.conflictWhere);
    return conflictUpdate(fieldsOf(definition, updatable), fieldsOf(definition, target), where);
  }

  #compile(definition: ModelDefinition, where: unknown): ExprNode | undefined {
    return WhereCompiler.isEmpty(where)
      ? undefined
      : this.#columns.whereCompiler(definition, undefined).compile(where);
  }

  static #upsertUpdate(
    definition: ModelDefinition,
    insertValues: Values,
    updatable: readonly string[],
  ): readonly string[] {
    return [
      ...updatable,
      ...(definition.updatedAt === undefined || updatable.includes(definition.updatedAt)
        ? []
        : [definition.updatedAt]),
    ].filter((name) => name in insertValues);
  }

  /** The first unique key (or unique index) containing an updated attribute, unless a primary key is updated. */
  static #upsertKey(definition: ModelDefinition, update: readonly string[]): UniqueKey | undefined {
    if (update.some((name) => definition.primaryKeys.includes(name))) {
      return undefined;
    }
    const uniqueKeys = [...definition.uniqueKeys.values()]
      .filter((fields) => fields.length > 0)
      .map((fields): UniqueKey => ({ fields }));
    const indexKeys = uniqueIndexKeys(definition, true);
    return update
      .map(
        (name) =>
          uniqueKeys.find((key) => key.fields.includes(name)) ??
          indexKeys.find((key) => key.fields.includes(name)),
      )
      .find((key) => key !== undefined);
  }
}
