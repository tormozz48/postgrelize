import { SqlExpression } from '../expressions/methods.ts';
import { InstanceState } from './instance-state.ts';
import { MergeQueryBuilder } from './merge-query-builder.ts';
import type { ModelDefinition } from './model-definition.ts';
import type { ModelRegistry } from './model-registry.ts';
import { OnConflictBuilder } from './on-conflict-builder.ts';
import type { AnyModel, ModelStatic, Values } from './options.ts';
import { ReturningOld } from './returning-old.ts';
import type { RowMapper } from './row-mapper.ts';

type Row = Readonly<Record<string, unknown>>;

const sameValue = (left: unknown, right: unknown): boolean =>
  left === right ||
  (left instanceof Date && right instanceof Date
    ? left.getTime() === right.getTime()
    : JSON.stringify(left) === JSON.stringify(right) || String(left) === String(right));

/**
 * Turns rows returned by writes into instances: strips the marker columns (inserted flag, merge
 * action, pre-statement values), records `wasInserted` / `oldValues`, and aligns `DO NOTHING`
 * results with the input rows.
 */
export class WrittenRows {
  readonly #registry: ModelRegistry;
  readonly #rows: RowMapper;
  readonly #returningOld: ReturningOld;

  /**
   * @param registry - Model definitions.
   * @param rows - Builds instances from rows.
   * @param returningOld - Reads pre-statement values.
   */
  constructor(registry: ModelRegistry, rows: RowMapper, returningOld: ReturningOld) {
    this.#registry = registry;
    this.#rows = rows;
    this.#returningOld = returningOld;
  }

  /**
   * Row without the marker columns added to RETURNING.
   *
   * @param row - Returned row.
   * @returns Row of model columns.
   */
  withoutMarkers(row: Row): Row {
    return Object.fromEntries(
      Object.entries(row).filter(
        ([key]) =>
          key !== OnConflictBuilder.INSERTED_FLAG &&
          key !== MergeQueryBuilder.ACTION &&
          !key.startsWith(ReturningOld.PREFIX),
      ),
    );
  }

  /**
   * Instance of a returned row; with `old`, its pre-statement values become `oldValues`.
   *
   * @param model - Model class.
   * @param row - Returned row.
   * @param old - Whether RETURNING included the pre-statement row.
   * @returns Instance.
   */
  instance<M extends AnyModel>(model: ModelStatic<M>, row: Row, old: boolean): M {
    const instance = this.#rows.instance(model, this.withoutMarkers(row));
    if (old) {
      InstanceState.of(instance).oldValues = this.#returningOld.previous(
        this.#registry.definition(model),
        row,
      );
    }
    return instance;
  }

  /**
   * Instance of a row returned by an INSERT with the inserted flag column; sets `wasInserted`.
   *
   * @param model - Model class.
   * @param row - Returned row.
   * @param old - Whether RETURNING included the pre-statement row.
   * @returns Instance.
   */
  inserted<M extends AnyModel>(model: ModelStatic<M>, row: Row, old: boolean): M {
    const instance = this.instance(model, row, old);
    InstanceState.of(instance).wasInserted = row[OnConflictBuilder.INSERTED_FLAG] === true;
    return instance;
  }

  /**
   * With `ON CONFLICT DO NOTHING` RETURNING has rows only for inserted records (in VALUES order).
   * Aligns them with the input rows; skipped records get `undefined`.
   *
   * @param definition - Model definition.
   * @param inputs - Inserted values.
   * @param returned - Returned rows.
   * @returns One returned row (or `undefined`) per input.
   */
  aligned(
    definition: ModelDefinition,
    inputs: readonly Values[],
    returned: readonly Row[],
  ): readonly (Row | undefined)[] {
    return inputs.reduce<Readonly<{ aligned: readonly (Row | undefined)[]; next: number }>>(
      (state, input) => {
        const row = returned[state.next];
        const parsed = row === undefined ? undefined : this.#rows.parse(definition, row);
        const matches =
          parsed !== undefined &&
          Object.entries(input).every(
            ([name, value]) =>
              value === undefined ||
              (value === null && definition.attributes.get(name)?.autoIncrement === true) ||
              value instanceof SqlExpression ||
              !(name in parsed) ||
              sameValue(parsed[name], value),
          );
        return matches
          ? { aligned: [...state.aligned, row], next: state.next + 1 }
          : { aligned: [...state.aligned, undefined], next: state.next };
      },
      { aligned: [], next: 0 },
    ).aligned;
  }
}
