import type { IncludeResolver } from '../../associations/include-resolver.ts';
import type { CopyEncoder } from '../../connection/copy.ts';
import type { SqlLiteral } from '../../ddl/sql-literal.ts';
import { SqlCompiler } from '../../sql/compile.ts';
import type { AttributeColumns } from '../attribute-columns.ts';
import type { FindQueryBuilder } from '../find-query-builder.ts';
import type { AttributeDefinition } from '../model-definition.ts';
import type { ModelRegistry } from '../model-registry.ts';
import type {
  AnyModel,
  CopyFromOptions,
  CopyToFormatOptions,
  CopyToOptions,
  FindOptions,
  ModelStatic,
  Values,
} from '../options.ts';

const COPY_FORMATS: ReadonlySet<string> = new Set(['text', 'csv', 'binary']);

/** Collaborators of {@link CopyOperation}. */
export type CopyOperationServices = Readonly<{
  /** Model state and scopes. */
  registry: ModelRegistry;
  /** Paranoid filter. */
  columns: AttributeColumns;
  /** Finder SELECT builder. */
  finds: FindQueryBuilder;
  /** Include trees. */
  includes: IncludeResolver;
  /** COPY text encoding of rows. */
  encoder: CopyEncoder;
  /** Escaped literals (COPY takes no parameters). */
  literals: SqlLiteral;
  /** SQL compiler. */
  compiler: SqlCompiler;
}>;

/** `Model.copyFrom` (`COPY ... FROM STDIN`) and `Model.copyTo` (`COPY (SELECT ...) TO STDOUT`). */
export class CopyOperation {
  readonly #registry: ModelRegistry;
  readonly #columns: AttributeColumns;
  readonly #finds: FindQueryBuilder;
  readonly #includes: IncludeResolver;
  readonly #encoder: CopyEncoder;
  readonly #literals: SqlLiteral;
  readonly #compiler: SqlCompiler;

  /**
   * @param services - Collaborators.
   */
  constructor(services: CopyOperationServices) {
    this.#registry = services.registry;
    this.#columns = services.columns;
    this.#finds = services.finds;
    this.#includes = services.includes;
    this.#encoder = services.encoder;
    this.#literals = services.literals;
    this.#compiler = services.compiler;
  }

  /**
   * `Model.copyFrom`: bulk-loads rows with `COPY ... FROM STDIN` (text format); timestamps are
   * filled when the model has them.
   *
   * @param model - Model class.
   * @param rows - Array, iterable or async iterable of attribute values.
   * @param options - `columns` and query options.
   * @returns Number of copied rows.
   * @throws Error without columns or for unknown attributes.
   */
  async copyFrom(
    model: ModelStatic<AnyModel>,
    rows: Iterable<Values> | AsyncIterable<Values>,
    options: CopyFromOptions,
  ): Promise<number> {
    const { definition, runtime } = this.#registry.state(model);
    const listed =
      options.columns ??
      (Array.isArray(rows) && rows.length > 0
        ? Object.keys(rows[0] as Values).filter((name) => definition.attributes.has(name))
        : undefined);
    if (listed === undefined || listed.length === 0) {
      throw new Error('copyFrom: columns are required for non-array sources');
    }
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
    const table = [definition.schema, definition.tableName]
      .filter((part): part is string => part !== undefined)
      .map(SqlCompiler.quoteIdent)
      .join('.');
    const text = `COPY ${table} (${attributes.map((attribute) => SqlCompiler.quoteIdent(attribute.field)).join(', ')}) FROM STDIN`;
    const now = new Date();
    const encoder = this.#encoder;
    async function* lines(): AsyncGenerator<string> {
      for await (const row of rows as AsyncIterable<Values>) {
        yield encoder.encodeRow(
          attributes.map((attribute) => {
            const value = stamps.includes(attribute.fieldName) ? now : row[attribute.fieldName];
            return value === undefined || value === null || attribute.type.serialize === undefined
              ? value
              : attribute.type.serialize(value);
          }),
        );
      }
    }
    return runtime.copyFrom(text, lines(), options);
  }

  /**
   * `Model.copyTo`: streams `COPY (SELECT ...) TO STDOUT` output; values of the query are inlined
   * as escaped literals.
   *
   * @param model - Model class.
   * @param options - Find options and output format.
   * @returns Async iterator of raw output chunks.
   * @throws Error for unsupported formats or multi-character delimiters / quotes.
   */
  copyTo(
    model: ModelStatic<AnyModel>,
    options: CopyToOptions,
  ): AsyncGenerator<Buffer, void, undefined> {
    const { definition, runtime } = this.#registry.state(model);
    const scoped = this.#registry.scoped(model, options);
    const query = {
      ...scoped,
      where: this.#columns.paranoid(definition, scoped.where, scoped.paranoid),
    };
    const includes = this.#includes.normalize(model, query.include);
    const select = this.#finds.build(
      definition,
      query as FindOptions,
      includes,
      runtime.inAsAnyThreshold,
    );
    return runtime.copyTo(
      `COPY (${this.#literals.inlineValues(this.#compiler.compile(select))}) TO STDOUT${this.#formatSql(options)}`,
      options,
      'read',
    );
  }

  #formatSql(options: CopyToFormatOptions): string {
    if (options.format !== undefined && !COPY_FORMATS.has(options.format)) {
      throw new Error(`copyTo: unsupported format ${String(options.format)}`);
    }
    const parts = [
      ...(options.format === undefined ? [] : [`FORMAT ${options.format}`]),
      ...(options.header === undefined ? [] : [`HEADER ${options.header ? 'true' : 'false'}`]),
      ...(options.delimiter === undefined
        ? []
        : [`DELIMITER ${this.#singleCharacter(options.delimiter, 'delimiter')}`]),
      ...(options.quote === undefined
        ? []
        : [`QUOTE ${this.#singleCharacter(options.quote, 'quote')}`]),
      ...(options.nullString === undefined
        ? []
        : [`NULL ${this.#literals.escape(options.nullString)}`]),
    ];
    return parts.length === 0 ? '' : ` WITH (${parts.join(', ')})`;
  }

  #singleCharacter(value: string, name: string): string {
    if ([...value].length !== 1) {
      throw new Error(`copyTo: ${name} must be a single character`);
    }
    return this.#literals.escape(value);
  }
}
