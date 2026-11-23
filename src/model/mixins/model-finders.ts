import { counter, finder } from '../model-operations.ts';
import type {
  AnyModel,
  Attributes,
  CountOptions,
  CountWithOptions,
  FindAndCountResult,
  GroupedCountResultItem,
  FindAndCountOptions,
  FindOptions,
  FindOrCreateOptions,
  ModelStatic,
} from '../options.ts';
import type { NonNullFindOptions } from '../v6-aliases.ts';
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
     * Selects all rows matching the options, applying the default scope and, for paranoid models,
     * hiding soft-deleted rows. Runs `beforeFind` and `afterFind` hooks unless `hooks: false`.
     *
     * @param this - The model class (or a scoped model class from {@link Model.scope}).
     * @param options - Query options (`where`, `attributes`, `order`, `limit`, `include`, ...).
     * @returns Instances, or plain objects with `raw: true`.
     * @example
     * ```ts
     * const posts = await Post.findAll({
     *   where: { published: true },
     *   order: [['createdAt', 'DESC']],
     *   limit: 20,
     *   include: [User],
     * });
     * ```
     * @see {@link Model.findEach} to stream large result sets.
     */
    static findAll<M extends AnyModel>(
      this: ModelStatic<M>,
      options: FindOptions<Attributes<M>> = {},
    ): Promise<M[]> {
      return finder.findAll(this, options as FindOptions);
    }

    /**
     * Selects the first row matching the options and rejects when none is found.
     *
     * @param this - The model class (or a scoped model class from {@link Model.scope}).
     * @param options - Query options with `rejectOnEmpty`.
     * @returns Instance.
     * @throws EmptyResultError (or the given error) when nothing is found.
     * @example
     * ```ts
     * const user = await User.findOne({ where: { email: 'ada@example.com' }, rejectOnEmpty: true });
     * ```
     */
    static findOne<M extends AnyModel>(
      this: ModelStatic<M>,
      options: NonNullFindOptions<Attributes<M>>,
    ): Promise<M>;

    /**
     * Selects the first row matching the options (`LIMIT 1` unless `limit` is given).
     *
     * @param this - The model class (or a scoped model class from {@link Model.scope}).
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
     * Selects the row with the given primary key and rejects when none is found.
     *
     * @param this - The model class (or a scoped model class from {@link Model.scope}).
     * @param key - Primary key value.
     * @param options - Query options other than `where`, with `rejectOnEmpty`.
     * @returns Instance.
     * @throws EmptyResultError (or the given error) when nothing is found.
     * @example
     * ```ts
     * const user = await User.findByPk(42, { rejectOnEmpty: true });
     * ```
     */
    static findByPk<M extends AnyModel>(
      this: ModelStatic<M>,
      key: unknown,
      options: Omit<NonNullFindOptions<Attributes<M>>, 'where'>,
    ): Promise<M>;

    /**
     * Selects the row with the given primary key.
     *
     * @param this - The model class (or a scoped model class from {@link Model.scope}).
     * @param key - Primary key value.
     * @param options - Query options other than `where`.
     * @returns Instance or `null`.
     * @example
     * ```ts
     * const user = await User.findByPk(42, { include: [Profile] });
     * ```
     */
    static findByPk<M extends AnyModel>(
      this: ModelStatic<M>,
      key?: unknown,
      options?: Omit<FindOptions<Attributes<M>>, 'where'>,
    ): Promise<M | null>;
    static findByPk<M extends AnyModel>(
      this: ModelStatic<M>,
      key?: unknown,
      options: Omit<FindOptions<Attributes<M>>, 'where'> = {},
    ): Promise<M | null> {
      return finder.findByPk(this, key, options as Omit<FindOptions, 'where'>);
    }

    /**
     * Counts rows per group, applying the default scope and the paranoid filter. Runs `beforeCount`
     * hooks unless `hooks: false`.
     *
     * @param this - The model class (or a scoped model class from {@link Model.scope}).
     * @param options - Count options with `group`.
     * @returns One `{ count, ...groupColumns }` item per group.
     * @example
     * ```ts
     * const rows = await User.count({ group: ['role'] });
     * rows.map((r) => r.count);
     * ```
     */
    static count<M extends AnyModel>(
      this: ModelStatic<M>,
      options: CountWithOptions<Attributes<M>>,
    ): Promise<GroupedCountResultItem[]>;

    /**
     * Counts rows, applying the default scope and the paranoid filter. Runs `beforeCount` hooks
     * unless `hooks: false`.
     *
     * @param this - The model class (or a scoped model class from {@link Model.scope}).
     * @param options - Count options (`where`, `col`, `distinct`, `include`).
     * @returns The count. Use the `group` overload for per-group counts.
     * @example
     * ```ts
     * const active = await User.count({ where: { active: true } });
     * ```
     */
    static count<M extends AnyModel>(
      this: ModelStatic<M>,
      options?: Omit<CountOptions<Attributes<M>>, 'group'>,
    ): Promise<number>;
    static count<M extends AnyModel>(
      this: ModelStatic<M>,
      options: CountOptions<Attributes<M>> = {},
    ): Promise<number | GroupedCountResultItem[]> {
      return counter.count(this, options as CountOptions);
    }

    /**
     * Runs {@link Model.findAll} and {@link Model.count} with the same filter, so `limit` / `offset`
     * paginate the rows while `count` is the total.
     *
     * @param this - The model class (or a scoped model class from {@link Model.scope}).
     * @param options - Query options.
     * @returns Total count and the current page of rows.
     * @example
     * ```ts
     * const { count, rows } = await Post.findAndCountAll({ where: { published: true }, limit: 10, offset: 20 });
     * ```
     */
    static findAndCountAll<M extends AnyModel>(
      this: ModelStatic<M>,
      options?: Omit<FindAndCountOptions<Attributes<M>>, 'group'>,
    ): Promise<FindAndCountResult<M>>;

    /**
     * With `group`, `count` is an array with one item per group (the grouped attributes and the row
     * count of the group) instead of a number.
     *
     * @param this - The model class (or a scoped model class from {@link Model.scope}).
     * @param options - Query options including `group`.
     * @returns Per-group counts and the current page of rows.
     * @example
     * ```ts
     * const { count, rows } = await Post.findAndCountAll({ group: ['status'] });
     * ```
     */
    static findAndCountAll<M extends AnyModel>(
      this: ModelStatic<M>,
      options: Omit<FindAndCountOptions<Attributes<M>>, 'group'> &
        Required<Pick<FindAndCountOptions<Attributes<M>>, 'group'>>,
    ): Promise<FindAndCountResult<M, GroupedCountResultItem[]>>;
    static findAndCountAll<M extends AnyModel>(
      this: ModelStatic<M>,
      options: FindAndCountOptions<Attributes<M>> = {},
    ): Promise<FindAndCountResult<M, number | GroupedCountResultItem[]>> {
      return finder.findAndCountAll(this, options as FindAndCountOptions);
    }

    /**
     * Finds a row, or creates it when none matches. Creation runs inside a transaction (a nested
     * one when `options.transaction` is given); when creation fails but the row exists after all
     * (a concurrent insert won), that row is returned, otherwise the error is rethrown.
     *
     * @param this - The model class (or a scoped model class from {@link Model.scope}).
     * @param options - `where` to search (its equality values also seed the new row), `defaults` to add on creation.
     * @returns `[instance, created]`.
     * @example
     * ```ts
     * const [tag, created] = await Tag.findOrCreate({ where: { name: 'news' }, defaults: { color: 'red' } });
     * ```
     */
    static findOrCreate<M extends AnyModel>(
      this: ModelStatic<M>,
      options: FindOrCreateOptions<Attributes<M>>,
    ): Promise<[M, boolean]> {
      return finder.findOrCreate(this, options as FindOrCreateOptions);
    }

    /**
     * Finds a row; when none matches, inserts it and, if that fails with a unique violation (a concurrent
     * insert won), reads the row again. Unlike `findOrCreate` the insert is not wrapped in a transaction, so it
     * suits code that already handles the race itself. Inside a transaction the insert uses a savepoint, which
     * fixes v6 returning an unsaved instance after a conflict.
     *
     * @param this - The model class (or a scoped model class from {@link Model.scope}).
     * @param options - `where` to search (required; its equality values also seed the new row), `defaults` to add on creation.
     * @returns `[instance, created]`.
     * @throws Error when `where` is missing.
     * @example
     * ```ts
     * const [tag, created] = await Tag.findCreateFind({ where: { name: 'news' }, defaults: { color: 'red' } });
     * ```
     */
    static findCreateFind<M extends AnyModel>(
      this: ModelStatic<M>,
      options: FindOrCreateOptions<Attributes<M>>,
    ): Promise<[M, boolean]> {
      return finder.findCreateFind(this, options as FindOrCreateOptions);
    }

    /**
     * Finds a row, or builds a new unsaved instance when none matches; nothing is inserted.
     *
     * @param this - The model class (or a scoped model class from {@link Model.scope}).
     * @param options - `where` to search (its equality values also seed the built instance), `defaults` to add when building.
     * @returns `[instance, built]`.
     * @example
     * ```ts
     * const [tag, built] = await Tag.findOrBuild({ where: { name: 'news' } });
     * if (built) {
     *   await tag.save();
     * }
     * ```
     */
    static findOrBuild<M extends AnyModel>(
      this: ModelStatic<M>,
      options: FindOrCreateOptions<Attributes<M>>,
    ): Promise<[M, boolean]> {
      return finder.findOrBuild(this, options as FindOrCreateOptions);
    }
  };
};
