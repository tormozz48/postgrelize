import type { AttributeDefinition, ModelDefinition } from '../model/model-definition.ts';
import type { AnyModel, ModelStatic } from '../model/options.ts';
import { ValuesWriter } from '../model/values-writer.ts';
import type { IncludeNode } from './include.ts';

type Model = ModelStatic<AnyModel>;

/** Result row keyed by column alias (`Posts.title` for included columns). */
export type IncludeRow = Readonly<Record<string, unknown>>;

/** Builds an instance of `model` from loaded values. */
export type InstanceBuilder = (model: Model, values: Readonly<Record<string, unknown>>) => AnyModel;

/** Reads and parses the values of included models out of joined result rows. */
export class IncludeRows {
  readonly #writer = new ValuesWriter();
  // Which attribute of an include a result column belongs to depends on its name only, so it is
  // worked out once per column name instead of once per row.
  readonly #directNames = new Map<string, Map<string, string | null>>();
  readonly #rawAttributes = new WeakMap<
    readonly IncludeNode[],
    Map<string, AttributeDefinition | null>
  >();

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
    const names = this.#namesUnder(path);
    const values: Record<string, unknown> = {};
    for (const key of Object.keys(row)) {
      const name = names.get(key) ?? this.#direct(names, path, key);
      if (name !== null) {
        this.#writer.set(values, name, this.parseValue(definition.attributes.get(name), row[key]));
      }
    }
    return values;
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
  ): string | number | undefined {
    if (Object.values(values).every((value) => value === null || value === undefined)) {
      return undefined;
    }
    const keys = definition.primaryKeys;
    if (keys.length === 0 || !keys.every((key) => key in values)) {
      return JSON.stringify(Object.entries(values));
    }
    const single = keys.length === 1 ? values[keys[0] as string] : undefined;
    return typeof single === 'number' ? single : JSON.stringify(keys.map((key) => values[key]));
  }

  /**
   * Parses a joined raw row: included keys are parsed with the included model's data types.
   *
   * @param includes - Include tree.
   * @param row - Joined row.
   * @param parseMain - Parses a row with the main model's data types; must return a new object.
   * @returns Parsed row.
   */
  parseRaw(
    includes: readonly IncludeNode[],
    row: IncludeRow,
    parseMain: (row: IncludeRow) => Readonly<Record<string, unknown>>,
  ): Record<string, unknown> {
    const parsed = parseMain(row) as Record<string, unknown>;
    const attributes = this.#attributesOf(includes);
    for (const key of Object.keys(parsed)) {
      const attribute = attributes.get(key) ?? this.#rawAttribute(includes, attributes, key);
      if (attribute !== null) {
        parsed[key] = this.parseValue(attribute, parsed[key]);
      }
    }
    return parsed;
  }

  #namesUnder(path: string): Map<string, string | null> {
    let names = this.#directNames.get(path);
    if (names === undefined) {
      names = new Map();
      this.#directNames.set(path, names);
    }
    return names;
  }

  #direct(names: Map<string, string | null>, path: string, key: string): string | null {
    const rest = key.startsWith(`${path}.`) ? key.slice(path.length + 1) : null;
    const name = rest !== null && !rest.includes('.') ? rest : null;
    names.set(key, name);
    return name;
  }

  #attributesOf(includes: readonly IncludeNode[]): Map<string, AttributeDefinition | null> {
    let attributes = this.#rawAttributes.get(includes);
    if (attributes === undefined) {
      attributes = new Map();
      this.#rawAttributes.set(includes, attributes);
    }
    return attributes;
  }

  #rawAttribute(
    includes: readonly IncludeNode[],
    attributes: Map<string, AttributeDefinition | null>,
    key: string,
  ): AttributeDefinition | null {
    const dot = key.lastIndexOf('.');
    const attribute =
      dot < 0
        ? null
        : (this.#definitionAt(this.#flatten(includes), key.slice(0, dot))?.attributes.get(
            key.slice(dot + 1),
          ) ?? null);
    attributes.set(key, attribute);
    return attribute;
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
