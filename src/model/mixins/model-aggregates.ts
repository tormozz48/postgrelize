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
     * Runs an aggregate function over a column.
     *
     * @param field - Attribute name or `'*'`.
     * @param aggregateFunction - SQL aggregate function name, e.g. `'max'`.
     * @param options - Options.
     * @returns Aggregated value.
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
     * Maximum value of an attribute.
     *
     * @param field - Attribute name.
     * @param options - Options.
     * @returns Maximum or `null`.
     */
    static max<M extends AnyModel, T = unknown>(
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
     * Minimum value of an attribute.
     *
     * @param field - Attribute name.
     * @param options - Options.
     * @returns Minimum or `null`.
     */
    static min<M extends AnyModel, T = unknown>(
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
     * Sum of an attribute.
     *
     * @param field - Attribute name.
     * @param options - Options.
     * @returns Sum or `null`.
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
