import { Subquery } from '../expressions/methods.ts';
import type { FromItem, JoinNode } from '../sql/ast.ts';
import type { AttributeColumns } from './attribute-columns.ts';
import type { ModelRegistry } from './model-registry.ts';
import { SourceOptionBuilder } from './source-option-builder.ts';
import type { FromSourceOption, JoinOptions, JoinsOption } from './source-options.ts';

/**
 * Extra relations for finders' `from`, `UPDATE ... FROM` and `DELETE ... USING`, keyed by alias.
 * PostgreSQL extension.
 */
export type JoinSources = Readonly<Record<string, FromSourceOption>>;

/** A join whose `on` condition still needs the where compiler of the outer query. */
export type PendingJoin = Readonly<{ type: JoinNode['type']; table: FromItem; on?: unknown }>;

const JOIN_TYPES: ReadonlyMap<string, JoinNode['type']> = new Map([
  ['inner', 'INNER'],
  ['left', 'LEFT OUTER'],
]);

/** Converts `from` / `using` options (models, subqueries, relation names) into FROM items. */
export class JoinSourceBuilder {
  readonly #registry: ModelRegistry;
  readonly #columns: AttributeColumns;
  readonly #objects: SourceOptionBuilder;

  /**
   * @param registry - Model definitions.
   * @param columns - Table references of models.
   */
  constructor(registry: ModelRegistry, columns: AttributeColumns) {
    this.#registry = registry;
    this.#columns = columns;
    this.#objects = new SourceOptionBuilder(registry, columns);
  }

  /**
   * Converts `from` / `using` options into FROM items.
   *
   * @param sources - Relations by alias.
   * @returns FROM items (empty without sources).
   */
  build(sources: JoinSources | undefined): readonly FromItem[] {
    return Object.entries(sources ?? {}).map(([alias, source]) => this.#item(alias, source));
  }

  /**
   * Converts the `joins` option.
   *
   * @param joins - Joins by alias.
   * @returns Joins with their uncompiled conditions (empty without joins).
   * @throws Error for an unknown join type.
   */
  joins(joins: JoinsOption | undefined): readonly PendingJoin[] {
    return Object.entries(joins ?? {}).map(([alias, join]) => ({
      type: JoinSourceBuilder.#type(join),
      table: this.#item(alias, join.source),
      on: join.on,
    }));
  }

  static #type({ type = 'inner' }: JoinOptions): JoinNode['type'] {
    const joined = JOIN_TYPES.get(type);
    if (joined === undefined) {
      throw new Error(`Invalid join type: ${String(type)}`);
    }
    return joined;
  }

  #item(alias: string, source: FromSourceOption): FromItem {
    if (typeof source === 'string') {
      return { name: source, ...(alias === source ? {} : { alias }) };
    }
    if (source instanceof Subquery) {
      return { subquery: source.build(), alias };
    }
    return typeof source === 'function'
      ? this.#columns.table(this.#registry.definition(source), alias)
      : this.#objects.build(alias, source);
  }
}
