import { Subquery } from '../expressions/methods.ts';
import type { FromItem } from '../sql/ast.ts';
import type { AttributeColumns } from './attribute-columns.ts';
import type { ModelRegistry } from './model-registry.ts';
import type { AnyModel, ModelStatic } from './options.ts';

/** Extra relations for `UPDATE ... FROM` / `DELETE ... USING`, keyed by alias. PostgreSQL extension. */
export type JoinSources = Readonly<Record<string, ModelStatic<AnyModel> | Subquery | string>>;

/** Converts `from` / `using` options (models, subqueries, relation names) into FROM items. */
export class JoinSourceBuilder {
  readonly #registry: ModelRegistry;
  readonly #columns: AttributeColumns;

  /**
   * @param registry - Model definitions.
   * @param columns - Table references of models.
   */
  constructor(registry: ModelRegistry, columns: AttributeColumns) {
    this.#registry = registry;
    this.#columns = columns;
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
          : this.#columns.table(this.#registry.definition(source), alias),
    );
  }
}
