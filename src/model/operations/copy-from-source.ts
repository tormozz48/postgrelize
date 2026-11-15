import type { CopyEncoder } from '../../connection/copy.ts';
import { SqlCompiler } from '../../sql/compile.ts';
import type { AttributeDefinition, ModelDefinition } from '../model-definition.ts';
import type { CopyFromOptions, Values } from '../options.ts';

type CopySource = Iterable<Values> | AsyncIterable<Values>;

/** Copied columns: attribute definitions in row order and the timestamps filled by `copyFrom`. */
export type CopyColumns = Readonly<{
  /** Attributes in row order. */
  attributes: readonly AttributeDefinition[];
  /** Timestamp attributes filled with the current time. */
  stamps: readonly string[];
}>;

/**
 * Columns, statement text and encoded lines of `Model.copyFrom` (`COPY ... FROM STDIN`).
 *
 * @internal
 */
export class CopyFromSource {
  readonly #encoder: CopyEncoder;

  /**
   * @param encoder - COPY text encoding of rows.
   */
  constructor(encoder: CopyEncoder) {
    this.#encoder = encoder;
  }

  /**
   * Resolves the copied columns: listed (or first-row) attributes plus missing timestamps.
   *
   * @param definition - Model definition.
   * @param rows - Row source.
   * @param options - `columns`.
   * @returns Attributes in row order and filled timestamps.
   * @throws Error without columns or for unknown attributes.
   */
  columns(definition: ModelDefinition, rows: CopySource, options: CopyFromOptions): CopyColumns {
    const listed = CopyFromSource.#listed(definition, rows, options);
    const stamps = [definition.createdAt, definition.updatedAt].filter(
      (name): name is string => name !== undefined && !listed.includes(name as never),
    );
    const columns = [...(listed as readonly string[]), ...stamps];
    columns.forEach((name) => {
      if (!definition.attributes.has(name)) {
        throw new Error(`copyFrom: unknown attribute "${name}" of model ${definition.name}`);
      }
    });
    const attributes = columns.map(
      (name) => definition.attributes.get(name) as AttributeDefinition,
    );
    return { attributes, stamps };
  }

  static #listed(
    definition: ModelDefinition,
    rows: CopySource,
    options: CopyFromOptions,
  ): readonly string[] {
    const listed =
      options.columns ??
      (Array.isArray(rows) && rows.length > 0
        ? Object.keys(rows[0] as Values).filter((name) => definition.attributes.has(name))
        : undefined);
    if (listed === undefined || listed.length === 0) {
      throw new Error('copyFrom: columns are required for non-array sources');
    }
    return listed;
  }

  /**
   * `COPY table (columns) FROM STDIN` text.
   *
   * @param definition - Model definition.
   * @param attributes - Copied attributes.
   * @returns Statement text.
   */
  sql(definition: ModelDefinition, attributes: readonly AttributeDefinition[]): string {
    const table = [definition.schema, definition.tableName]
      .filter((part): part is string => part !== undefined)
      .map(SqlCompiler.quoteIdent)
      .join('.');
    return `COPY ${table} (${attributes.map((attribute) => SqlCompiler.quoteIdent(attribute.field)).join(', ')}) FROM STDIN`;
  }

  /**
   * Encodes rows as COPY text lines, filling timestamps with `now`.
   *
   * @param rows - Row source.
   * @param columns - Copied columns.
   * @param now - Timestamp value.
   * @returns Async iterator of encoded lines.
   */
  async *lines(
    rows: CopySource,
    { attributes, stamps }: CopyColumns,
    now: Date,
  ): AsyncGenerator<string> {
    for await (const row of rows as AsyncIterable<Values>) {
      yield this.#encoder.encodeRow(
        attributes.map((attribute) => {
          const value = stamps.includes(attribute.fieldName) ? now : row[attribute.fieldName];
          return value === undefined || value === null || attribute.type.serialize === undefined
            ? value
            : attribute.type.serialize(value);
        }),
      );
    }
  }
}
