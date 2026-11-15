import { Subquery } from '../expressions/methods.ts';
import type { FromItem } from '../sql/ast.ts';
import type { AttributeColumns } from './attribute-columns.ts';
import type { ModelRegistry } from './model-registry.ts';
import { SourceOptionBuilder } from './source-option-builder.ts';
import type { FromSourceOption } from './source-options.ts';

/**
 * Extra relations for finders' `from`, `UPDATE ... FROM` and `DELETE ... USING`, keyed by alias.
 * PostgreSQL extension.
 */
export type JoinSources = Readonly<Record<string, FromSourceOption>>;

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
    return Object.entries(sources ?? {}).map(([alias, source]): FromItem =>
      typeof source === 'string'
        ? { name: source, ...(alias === source ? {} : { alias }) }
        : source instanceof Subquery
          ? { subquery: source.build(), alias }
          : typeof source === 'function'
            ? this.#columns.table(this.#registry.definition(source), alias)
            : this.#objects.build(alias, source),
    );
  }
}
