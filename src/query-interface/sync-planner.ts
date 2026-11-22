import type { AttributeDefinition, ModelDefinition } from '../model/model-definition.ts';

/**
 * Plans the order of `sync()` over several models: referenced tables first, and the foreign keys
 * of reference cycles deferred until every table exists.
 *
 * @internal
 */
export class SyncPlanner {
  /**
   * Orders definitions so that referenced tables come first.
   *
   * @param definitions - Model definitions.
   * @returns Definitions in dependency order.
   */
  dependencyOrder(definitions: readonly ModelDefinition[]): readonly ModelDefinition[] {
    const byTable = new Map(definitions.map((definition) => [definition.tableName, definition]));
    return definitions.reduce<readonly ModelDefinition[]>(
      (ordered, definition) => this.#visit(byTable, definition, new Set(), ordered),
      [],
    );
  }

  /**
   * Columns (by field) of each definition whose foreign key points to a table created later in
   * `ordered` — a reference cycle. Their tables are created without these constraints, which are
   * added once every table exists.
   *
   * @param ordered - Definitions in dependency order.
   * @returns Deferred fields per definition.
   */
  deferredReferences(
    ordered: readonly ModelDefinition[],
  ): ReadonlyMap<ModelDefinition, readonly string[]> {
    const position = new Map(ordered.map((definition, index) => [definition.tableName, index]));
    return new Map(
      ordered.map((definition, index) => [
        definition,
        [...definition.attributes.values()]
          .filter((attribute) => {
            const target = position.get(this.#referencedTable(attribute.references) ?? '');
            return target !== undefined && target > index;
          })
          .map((attribute) => attribute.field),
      ]),
    );
  }

  #visit(
    byTable: ReadonlyMap<string, ModelDefinition>,
    definition: ModelDefinition,
    seen: ReadonlySet<string>,
    ordered: readonly ModelDefinition[],
  ): readonly ModelDefinition[] {
    if (ordered.includes(definition) || seen.has(definition.tableName)) {
      return ordered;
    }
    const nextSeen = new Set([...seen, definition.tableName]);
    const withDependencies = this.#dependencies(byTable, definition).reduce(
      (acc, dependency) => this.#visit(byTable, dependency, nextSeen, acc),
      ordered,
    );
    return withDependencies.includes(definition)
      ? withDependencies
      : [...withDependencies, definition];
  }

  #dependencies(
    byTable: ReadonlyMap<string, ModelDefinition>,
    definition: ModelDefinition,
  ): readonly ModelDefinition[] {
    return this.#referencedTables(definition)
      .map((table) => byTable.get(table))
      .filter(
        (dependency): dependency is ModelDefinition =>
          dependency !== undefined && dependency !== definition,
      );
  }

  #referencedTable(references: AttributeDefinition['references']): string | undefined {
    if (references === undefined || typeof references === 'string') {
      return references;
    }
    const model = references.model;
    if (typeof model === 'string') {
      return model;
    }
    const table = 'getTableName' in model ? model.getTableName() : model;
    return typeof table === 'string' ? table : table.tableName;
  }

  #referencedTables(definition: ModelDefinition): readonly string[] {
    return [...definition.attributes.values()].flatMap((attribute) => {
      const table = this.#referencedTable(attribute.references);
      return table === undefined ? [] : [table];
    });
  }
}
