import { counter, finder } from '../model-operations.ts';
import type {
  AnyModel,
  Attributes,
  CountOptions,
  FindAndCountResult,
  FindOptions,
  FindOrCreateOptions,
  ModelStatic,
} from '../options.ts';
import type { ModelConstructor } from './model-constructor.ts';

/**
 * Read statics of `Model`: `findAll`, `findOne`, `findByPk`, `count`, `findAndCountAll`, `findOrCreate`, `findOrBuild`.
 *
 * @internal
 */
// oxlint-disable-next-line max-lines-per-function, typescript/explicit-module-boundary-types -- a mixin factory's body is its class (each method is still size-checked); its type can only be inferred.
export const ModelFinders = <TBase extends ModelConstructor>(Base: TBase) => {
  return class FindersCapability extends Base {
    /**
     * Finds all rows matching the options (default scope and paranoid filter applied).
     *
     * @param options - Query options.
     * @returns Instances, or plain objects with `raw: true`.
     */
    static findAll<M extends AnyModel>(
      this: ModelStatic<M>,
      options: FindOptions<Attributes<M>> = {},
    ): Promise<M[]> {
      return finder.findAll(this, options as FindOptions);
    }

    /**
     * Finds the first row matching the options, throwing when none is found.
     *
     * @param options - Query options with `rejectOnEmpty`.
     * @returns Instance.
     * @throws EmptyResultError (or the given error) when nothing is found.
     */
    static findOne<M extends AnyModel>(
      this: ModelStatic<M>,
      options: FindOptions<Attributes<M>> & Readonly<{ rejectOnEmpty: true | Error }>,
    ): Promise<M>;

    /**
     * Finds the first row matching the options.
     *
     * @param options - Query options.
     * @returns Instance or `null`.
     */
    static findOne<M extends AnyModel>(
      this: ModelStatic<M>,
      options?: FindOptions<Attributes<M>>,
    ): Promise<M | null>;
    static findOne<M extends AnyModel>(
      this: ModelStatic<M>,
      options: FindOptions<Attributes<M>> = {},
    ): Promise<M | null> {
      return finder.findOne(this, options as FindOptions);
    }

    /**
     * Finds a row by primary key.
     *
     * @param key - Primary key value.
     * @param options - Query options.
     * @returns Instance or `null`.
     */
    static findByPk<M extends AnyModel>(
      this: ModelStatic<M>,
      key: unknown,
      options: Omit<FindOptions<Attributes<M>>, 'where'> = {},
    ): Promise<M | null> {
      return finder.findByPk(this, key, options as Omit<FindOptions, 'where'>);
    }

    /**
     * Counts rows (default scope and paranoid filter applied).
     *
     * @param options - Count options.
     * @returns Count, or `{ count, ...groups }[]` with `group`.
     */
    static count<M extends AnyModel>(
      this: ModelStatic<M>,
      options: CountOptions<Attributes<M>> = {},
    ): Promise<number> {
      return counter.count(this, options as CountOptions);
    }

    /**
     * Runs `findAll` and `count` with the same filter.
     *
     * @param options - Query options.
     * @returns Total count and the current page of rows.
     */
    static findAndCountAll<M extends AnyModel>(
      this: ModelStatic<M>,
      options: FindOptions<Attributes<M>> = {},
    ): Promise<FindAndCountResult<M>> {
      return finder.findAndCountAll(this, options as FindOptions);
    }

    /**
     * Finds a row or creates it inside a transaction.
     *
     * @param options - `where` to search, `defaults` to add on creation.
     * @returns `[instance, created]`.
     */
    static findOrCreate<M extends AnyModel>(
      this: ModelStatic<M>,
      options: FindOrCreateOptions<Attributes<M>>,
    ): Promise<[M, boolean]> {
      return finder.findOrCreate(this, options as FindOrCreateOptions);
    }

    /**
     * Finds a row or builds (without saving) a new instance.
     *
     * @param options - `where` to search, `defaults` to add when building.
     * @returns `[instance, built]`.
     */
    static findOrBuild<M extends AnyModel>(
      this: ModelStatic<M>,
      options: FindOrCreateOptions<Attributes<M>>,
    ): Promise<[M, boolean]> {
      return finder.findOrBuild(this, options as FindOrCreateOptions);
    }
  };
};
