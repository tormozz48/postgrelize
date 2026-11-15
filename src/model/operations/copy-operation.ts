import type { IncludeResolver } from '../../associations/include-resolver.ts';
import type { CopyEncoder } from '../../connection/copy.ts';
import type { SqlLiteral } from '../../ddl/sql-literal.ts';
import type { SqlCompiler } from '../../sql/compile.ts';
import type { AttributeColumns } from '../attribute-columns.ts';
import type { FindQueryBuilder } from '../find-query-builder.ts';
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
import { CopyFromSource } from './copy-from-source.ts';

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
  readonly #services: CopyOperationServices;
  readonly #source: CopyFromSource;

  /**
   * @param services - Collaborators.
   */
  constructor(services: CopyOperationServices) {
    this.#services = services;
    this.#source = new CopyFromSource(services.encoder);
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
    const { definition, runtime } = this.#services.registry.state(model);
    const columns = this.#source.columns(definition, rows, options);
    const text = this.#source.sql(definition, columns.attributes);
    const lines = this.#source.lines(rows, columns, new Date());
    return runtime.copyFrom(text, lines, options);
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
    const { runtime } = this.#services.registry.state(model);
    const { compiler, literals } = this.#services;
    const select = this.#select(model, options);
    return runtime.copyTo(
      `COPY (${literals.inlineValues(compiler.compile(select))}) TO STDOUT${this.#formatSql(options)}`,
      options,
      'read',
    );
  }

  #select(model: ModelStatic<AnyModel>, options: CopyToOptions) {
    const { definition, runtime } = this.#services.registry.state(model);
    const { registry, columns, includes, finds } = this.#services;
    const scoped = registry.scoped(model, options);
    const query = {
      ...scoped,
      where: columns.paranoid(definition, scoped.where, scoped.paranoid),
    };
    const normalized = includes.normalize(model, query.include);
    return finds.build(definition, query as FindOptions, normalized, runtime.inAsAnyThreshold);
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
        : [`NULL ${this.#services.literals.escape(options.nullString)}`]),
    ];
    return parts.length === 0 ? '' : ` WITH (${parts.join(', ')})`;
  }

  #singleCharacter(value: string, name: string): string {
    if ([...value].length !== 1) {
      throw new Error(`copyTo: ${name} must be a single character`);
    }
    return this.#services.literals.escape(value);
  }
}
