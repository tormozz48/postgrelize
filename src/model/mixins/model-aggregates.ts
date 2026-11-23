import { counter } from '../model-operations.ts';
import type { Model } from '../model.ts';
import type { AggregateOptions, AnyModel, Attributes, ModelStatic } from '../options.ts';
import type { ModelConstructor } from './model-constructor.ts';

/**
 * Aggregate statics of `Model`: `aggregate`, `max`, `min`, `sum`.
 *
 * @internal
 */
// oxlint-disable-next-line max-lines-per-function, typescript/explicit-module-boundary-types -- a mixin factory's body is its class (each method is still size-checked); its type can only be inferred.
export const ModelAggregates = <TBase extends ModelConstructor>(Base: TBase) => {
  return class AggregatesCapability extends Base {
    /**
     * Runs one SQL aggregate function over a column (`SELECT fn(col) ...`), applying the default scope
     * and the paranoid filter. The function name is checked against a safe name pattern, never
     * concatenated unchecked.
     *
     * @param this - The model class.
     * @param field - Attribute name or `'*'`.
     * @param aggregateFunction - SQL aggregate function name, e.g. `'max'`.
     * @param options - Options (`where`, `distinct`, `group`, `plain: false` to get rows, query options).
     * @returns Aggregated value: a number for `count` and numeric attributes, otherwise parsed like the attribute; rows with `plain: false`.
     * @example
     * ```ts
     * const avgPrice = await Product.aggregate('price', 'avg', { where: { active: true } });
     * ```
     */
    static aggregate<M extends AnyModel, T = unknown>(
      this: ModelStatic<M>,
      field: keyof Attributes<M> | '*',
      aggregateFunction: string,
      options: AggregateOptions<Attributes<M>> = {},
    ): Promise<T> {
      return counter.aggregate(
        this,
        String(field),
        aggregateFunction,
        options as AggregateOptions,
      ) as Promise<T>;
    }

    /**
     * Finds the largest value of an attribute with `max()`.
     *
     * @param this - The model class.
     * @param field - Attribute name.
     * @param options - Options, see {@link Model.aggregate}.
     * @returns Maximum or `null` when there are no rows.
     * @example
     * ```ts
     * const highest = await Product.max('price');
     * ```
     */
    static max<T = unknown, M extends AnyModel = AnyModel>(
      this: ModelStatic<M>,
      field: keyof Attributes<M>,
      options?: AggregateOptions<Attributes<M>>,
    ): Promise<T> {
      return (this as unknown as typeof Model).aggregate.call(
        this,
        field as never,
        'max',
        options as AggregateOptions,
      ) as Promise<T>;
    }

    /**
     * Finds the smallest value of an attribute with `min()`.
     *
     * @param this - The model class.
     * @param field - Attribute name.
     * @param options - Options, see {@link Model.aggregate}.
     * @returns Minimum or `null` when there are no rows.
     * @example
     * ```ts
     * const lowest = await Product.min('price', { where: { active: true } });
     * ```
     */
    static min<T = unknown, M extends AnyModel = AnyModel>(
      this: ModelStatic<M>,
      field: keyof Attributes<M>,
      options?: AggregateOptions<Attributes<M>>,
    ): Promise<T> {
      return (this as unknown as typeof Model).aggregate.call(
        this,
        field as never,
        'min',
        options as AggregateOptions,
      ) as Promise<T>;
    }

    /**
     * Adds up the values of an attribute with `sum()`.
     *
     * @param this - The model class.
     * @param field - Attribute name.
     * @param options - Options, see {@link Model.aggregate}.
     * @returns Sum, or `null` when there are no rows (as returned by PostgreSQL).
     * @example
     * ```ts
     * const total = await Invoice.sum('amount', { where: { paid: true } });
     * ```
     */
    static sum<M extends AnyModel>(
      this: ModelStatic<M>,
      field: keyof Attributes<M>,
      options?: AggregateOptions<Attributes<M>>,
    ): Promise<number> {
      return (this as unknown as typeof Model).aggregate.call(
        this,
        field as never,
        'sum',
        options as AggregateOptions,
      ) as Promise<number>;
    }
  };
};
