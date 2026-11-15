import type { AttributeDefinition, ModelDefinition } from '../model/model-definition.ts';
import type { AnyModel, ModelStatic } from '../model/options.ts';
import type { IncludeNode } from './include.ts';

type Model = ModelStatic<AnyModel>;

/** Result row keyed by column alias (`Posts.title` for included columns). */
export type IncludeRow = Readonly<Record<string, unknown>>;

/** Builds an instance of `model` from loaded values. */
export type InstanceBuilder = (model: Model, values: Readonly<Record<string, unknown>>) => AnyModel;

/** Reads and parses the values of included models out of joined result rows. */
export class IncludeRows {
  /**
   * Value parsed with an attribute's data type.
   *
   * @param attribute - Attribute definition, if known.
   * @param value - Raw value.
   * @returns Parsed value (`null` / `undefined` are kept).
   */
  parseValue(attribute: AttributeDefinition | undefined, value: unknown): unknown {
    return value === null || value === undefined || attribute?.type.parse === undefined
      ? value
      : attribute.type.parse(value);
  }

  /**
   * Values of the columns directly under `path` (`Posts.title` → `title`), parsed.
   *
   * @param definition - Definition of the included model.
   * @param row - Joined row.
   * @param path - Result path of the include.
   * @returns Attribute values.
   */
  valuesAt(definition: ModelDefinition, row: IncludeRow, path: string): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(row)
        .filter(([key]) => key.startsWith(`${path}.`) && !key.slice(path.length + 1).includes('.'))
        .map(([key, value]) => {
          const name = key.slice(path.length + 1);
          return [name, this.parseValue(definition.attributes.get(name), value)];
        }),
    );
  }

  /**
   * Identity of an instance for de-duplication: its primary key, else all values.
   *
   * @param definition - Model definition.
   * @param values - Attribute values.
   * @returns Identity, or `undefined` when every value is `null` (no row joined).
   */
  identity(
    definition: ModelDefinition,
    values: Readonly<Record<string, unknown>>,
  ): string | undefined {
    if (Object.values(values).every((value) => value === null || value === undefined)) {
      return undefined;
    }
    const keys = definition.primaryKeys;
    return keys.length > 0 && keys.every((key) => key in values)
      ? JSON.stringify(keys.map((key) => values[key]))
      : JSON.stringify(Object.entries(values));
  }

  /**
   * Parses a joined raw row: included keys are parsed with the included model's data types.
   *
   * @param includes - Include tree.
   * @param row - Joined row.
   * @param parseMain - Parses a row with the main model's data types.
   * @returns Parsed row.
   */
  parseRaw(
    includes: readonly IncludeNode[],
    row: IncludeRow,
    parseMain: (row: IncludeRow) => Readonly<Record<string, unknown>>,
  ): Record<string, unknown> {
    const all = this.#flatten(includes);
    return Object.fromEntries(
      Object.entries(parseMain(row)).map(([key, value]) => [
        key,
        this.#parseEntry(all, key, value),
      ]),
    );
  }

  #parseEntry(all: readonly IncludeNode[], key: string, value: unknown): unknown {
    const dot = key.lastIndexOf('.');
    return dot < 0
      ? value
      : this.parseValue(
          this.#definitionAt(all, key.slice(0, dot))?.attributes.get(key.slice(dot + 1)),
          value,
        );
  }

  #definitionAt(all: readonly IncludeNode[], path: string): ModelDefinition | undefined {
    return (
      all.find((candidate) => candidate.path === path)?.definition ??
      all.find((candidate) => candidate.through?.path === path)?.through?.definition
    );
  }

  #flatten(list: readonly IncludeNode[]): readonly IncludeNode[] {
    return list.flatMap((node) => [node, ...this.#flatten(node.children)]);
  }
}
