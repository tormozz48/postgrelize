import { AssertionError } from 'node:assert';
import type { SqlCompiler } from '../../sql/compile.ts';
import type { AttributeColumns } from '../attribute-columns.ts';
import type { ModelDefinition } from '../model-definition.ts';
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
  readonly #services: IncrementOperationServices;

  /**
   * @param services - Collaborators.
   */
  constructor(services: IncrementOperationServices) {
    this.#services = services;
  }

  /**
   * Increments (`sign` 1) or decrements (`sign` -1) attributes of matching rows.
   *
   * @param model - Model class.
   * @param fields - Attribute name(s), or a map of attribute to amount.
   * @param options - Increment options.
   * @param sign - `1` or `-1`.
   * @returns Updated instances and the affected row count.
   * @throws AssertionError when neither `options.where` nor the active scope gives a `where`.
   */
  async change<M extends AnyModel>(
    model: ModelStatic<M>,
    fields: AttributeAmounts<Values>,
    options: IncrementOptions,
    sign: 1 | -1,
  ): Promise<[M[], number]> {
    const { definition, runtime } = this.#services.registry.state(model);
    const { compiler, rows, updates } = this.#services;
    const scoped = this.#services.registry.scoped(model, options);
    if (scoped.where === undefined || scoped.where === null) {
      throw new AssertionError({ message: 'Missing where attribute in the options parameter' });
    }
    const set = this.#setItems(definition, fields, scoped, sign);
    const node = updates.build(definition, set, scoped.where, { returning: true });
    const result = await runtime.execute(compiler.compile(node), scoped);
    return [result.rows.map((row) => rows.instance(model, row)), result.rowCount];
  }

  // like v6, the version of optimistic locking goes up on `decrement` too
  #amounts(definition: ModelDefinition, given: Readonly<Record<string, number>>, sign: 1 | -1) {
    const { updates } = this.#services;
    const { version } = definition;
    const { [version ?? '']: _own, ...amounts } = given;
    const bumped = version === undefined ? [] : updates.increment(definition, { [version]: 1 }, 1);
    return [...updates.increment(definition, amounts, sign), ...bumped];
  }

  #setItems(
    definition: ModelDefinition,
    fields: AttributeAmounts<Values>,
    options: IncrementOptions,
    sign: 1 | -1,
  ) {
    const { columns, values } = this.#services;
    const silent = options.silent === true;
    const timestamp = values.withTimestamps(definition, {}, new Date(), false, silent);
    return [
      ...this.#amounts(definition, values.amounts(fields, options.by ?? 1), sign),
      ...columns.setItems(definition, timestamp),
    ];
  }
}
