import type { ModelDefinition } from './model-definition.ts';

/** How one driver column is stored: the attribute it maps to and its data type parser. */
export type ColumnPlan = Readonly<{
  name: string;
  parse: ((value: unknown) => unknown) | undefined;
}>;

/**
 * Per-definition cache of column plans. A driver row is converted once per row and column, so the
 * attribute lookup (`attributes`, `fieldToAttribute`, type parser) is resolved once per column name
 * instead. Definitions are replaced, never mutated, so the cache is keyed by definition identity.
 */
export class RowPlans {
  readonly #plans = new WeakMap<ModelDefinition, Map<string, ColumnPlan>>();

  /**
   * Plans of a definition, filled lazily by {@link RowPlans.plan}.
   *
   * @param definition - Model definition.
   * @returns Column plans by driver column name.
   */
  columns(definition: ModelDefinition): Map<string, ColumnPlan> {
    let columns = this.#plans.get(definition);
    if (columns === undefined) {
      columns = new Map();
      this.#plans.set(definition, columns);
    }
    return columns;
  }

  /**
   * Resolves and remembers the plan of a column. Columns that match no attribute are kept as they
   * are, without a parser.
   *
   * @param definition - Model definition.
   * @param columns - The definition's plans.
   * @param key - Driver column name.
   * @returns The plan.
   */
  plan(definition: ModelDefinition, columns: Map<string, ColumnPlan>, key: string): ColumnPlan {
    const name = definition.attributes.has(key)
      ? key
      : (definition.fieldToAttribute.get(key) ?? key);
    const plan = { name, parse: definition.attributes.get(name)?.type.parse };
    columns.set(key, plan);
    return plan;
  }
}
