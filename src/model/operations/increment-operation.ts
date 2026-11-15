import type { SqlCompiler } from '../../sql/compile.ts';
import type { AttributeColumns } from '../attribute-columns.ts';
import type { ModelRegistry } from '../model-registry.ts';
import type { ModelValues } from '../model-values.ts';
import type {
  AnyModel,
  AttributeAmounts,
  IncrementOptions,
  ModelStatic,
  Values,
} from '../options.ts';
import type { RowMapper } from '../row-mapper.ts';
import type { UpdateQueryBuilder } from '../update-query-builder.ts';

/** Collaborators of {@link IncrementOperation}. */
export type IncrementOperationServices = Readonly<{
  /** Model state. */
  registry: ModelRegistry;
  /** Value rules. */
  values: ModelValues;
  /** SET items. */
  columns: AttributeColumns;
  /** UPDATE builder. */
  updates: UpdateQueryBuilder;
  /** Instances of returned rows. */
  rows: RowMapper;
  /** SQL compiler. */
  compiler: SqlCompiler;
}>;

/** `Model.increment` / `Model.decrement`: `SET x = x ± by` (and `updatedAt`) on matching rows. */
export class IncrementOperation {
  readonly #registry: ModelRegistry;
  readonly #values: ModelValues;
  readonly #columns: AttributeColumns;
  readonly #updates: UpdateQueryBuilder;
  readonly #rows: RowMapper;
  readonly #compiler: SqlCompiler;

  /**
   * @param services - Collaborators.
   */
  constructor(services: IncrementOperationServices) {
    this.#registry = services.registry;
    this.#values = services.values;
    this.#columns = services.columns;
    this.#updates = services.updates;
    this.#rows = services.rows;
    this.#compiler = services.compiler;
  }

  /**
   * Increments (`sign` 1) or decrements (`sign` -1) attributes of matching rows.
   *
   * @param model - Model class.
   * @param fields - Attribute name(s), or a map of attribute to amount.
   * @param options - Increment options.
   * @param sign - `1` or `-1`.
   * @returns Updated instances and the affected row count.
   */
  async change<M extends AnyModel>(
    model: ModelStatic<M>,
    fields: AttributeAmounts<Values>,
    options: IncrementOptions,
    sign: 1 | -1,
  ): Promise<[M[], number]> {
    const { definition, runtime } = this.#registry.state(model);
    const amounts = this.#values.amounts(fields, options.by ?? 1);
    const timestamp = this.#values.withTimestamps(
      definition,
      {},
      new Date(),
      false,
      options.silent === true,
    );
    const node = this.#updates.build(
      definition,
      [
        ...this.#updates.increment(definition, amounts, sign),
        ...this.#columns.setItems(definition, timestamp),
      ],
      options.where ?? {},
      { returning: true },
    );
    const result = await runtime.execute(this.#compiler.compile(node), options);
    return [result.rows.map((row) => this.#rows.instance(model, row)), result.rowCount];
  }
}
