import {
  bulkCreator,
  creator,
  destroyer,
  incrementer,
  updater,
  upserter,
} from '../model-operations.ts';
import type {
  AnyModel,
  AttributeAmounts,
  Attributes,
  BuildOptions,
  BulkCreateOptions,
  CreateOptions,
  CreationAttributes,
  DestroyOptions,
  IncrementOptions,
  ModelStatic,
  RestoreOptions,
  UpdateOptions,
  UpsertOptions,
  Values,
} from '../options.ts';
import type { ModelConstructor } from './model-constructor.ts';

/**
 * Write statics of `Model`: `build`, `bulkBuild`, `create`, `bulkCreate`, `upsert`, `update`, `destroy`, `restore`, `increment`, `decrement`.
 *
 * @internal
 */
// oxlint-disable-next-line max-lines-per-function, typescript/explicit-module-boundary-types -- a mixin factory's body is its class (each method is still size-checked); its type can only be inferred.
export const ModelWriters = <TBase extends ModelConstructor>(Base: TBase) => {
  return class WritersCapability extends Base {
    /**
     * Builds a new instance in memory without touching the database; call `save()` to insert it.
     * Defaults and custom setters are applied.
     *
     * @param this - The model class.
     * @param values - Attribute values.
     * @param options - Build options.
     * @returns New instance.
     * @example
     * ```ts
     * const user = User.build({ email: 'ada@example.com' });
     * await user.save();
     * ```
     */
    static build<M extends AnyModel>(
      this: ModelStatic<M>,
      values?: CreationAttributes<M> | Values,
      options?: BuildOptions,
    ): M {
      return new this(values as Values, options);
    }

    /**
     * Builds several new instances in memory, same as calling {@link Model.build} for each record.
     *
     * @param this - The model class.
     * @param records - Attribute values per instance.
     * @param options - Build options.
     * @returns New instances.
     * @example
     * ```ts
     * const tags = Tag.bulkBuild([{ name: 'news' }, { name: 'sports' }]);
     * ```
     */
    static bulkBuild<M extends AnyModel>(
      this: ModelStatic<M>,
      records: readonly (CreationAttributes<M> | Values)[],
      options?: BuildOptions,
    ): M[] {
      return records.map((values) => new this(values as Values, options));
    }

    /**
     * Builds an instance and inserts it with `INSERT ... RETURNING`, running validation and the
     * create/save hooks. With `onConflict` (PostgreSQL extension) the insert may be skipped or turned
     * into an update, and `instance.wasInserted` tells which happened.
     *
     * @param this - The model class.
     * @param values - Attribute values.
     * @param options - Create options (`fields`, `hooks`, `validate`, `include`, `onConflict`, query options).
     * @returns Saved instance.
     * @throws ValidationError when validation fails.
     * @throws UniqueConstraintError when a unique constraint is violated.
     * @throws ForeignKeyConstraintError when a foreign key constraint is violated.
     * @throws DatabaseError for other database errors.
     * @example
     * ```ts
     * const user = await User.create({ email: 'ada@example.com' }, { transaction });
     * ```
     */
    static create<M extends AnyModel>(
      this: ModelStatic<M>,
      values?: CreationAttributes<M>,
      options: CreateOptions<Attributes<M>> = {},
    ): Promise<M> {
      return creator.create(this, values as Values | undefined, options as CreateOptions);
    }

    /**
     * Inserts many rows with one multi-row `INSERT ... RETURNING`. Runs `beforeBulkCreate` and
     * `afterBulkCreate` hooks; rows are not validated unless `validate: true`. `ignoreDuplicates`,
     * `updateOnDuplicate` and `onConflict` map to `ON CONFLICT`; `individualHooks` or `include`
     * insert row by row like Sequelize v6.
     *
     * @param this - The model class.
     * @param records - Attribute values per row.
     * @param options - Bulk create options.
     * @returns Instances with values returned by the database.
     * @throws ValidationError with `validate: true` when a row is invalid.
     * @throws UniqueConstraintError when a unique constraint is violated and no conflict handling is set.
     * @example
     * ```ts
     * const tags = await Tag.bulkCreate([{ name: 'news' }, { name: 'sports' }], { ignoreDuplicates: true });
     * ```
     * @see {@link Model.insert} for the PostgreSQL variant that returns only the rows actually written.
     */
    static bulkCreate<M extends AnyModel>(
      this: ModelStatic<M>,
      records: readonly CreationAttributes<M>[],
      options: BulkCreateOptions<Attributes<M>> = {},
    ): Promise<M[]> {
      return bulkCreator.bulkCreate(
        this,
        records as readonly Values[],
        options as BulkCreateOptions,
      );
    }

    /**
     * Inserts a row, or updates it when it conflicts with a unique key (`INSERT ... ON CONFLICT DO UPDATE`,
     * Sequelize v6 `upsert`). Runs the `beforeUpsert` and `afterUpsert` hooks.
     *
     * @param this - The model class.
     * @param values - Attribute values.
     * @param options - Upsert options (`conflictFields`, `fields`, `onConflict`, query options).
     * @returns `[instance, null]` like Sequelize v6, or `[instance, created]` with `onConflict`.
     * @throws ValidationError when validation fails.
     * @throws UniqueConstraintError when a unique constraint other than the conflict target is violated.
     * @example
     * ```ts
     * const [user] = await User.upsert({ email: 'ada@example.com', name: 'Ada' }, { conflictFields: ['email'] });
     * ```
     */
    static upsert<M extends AnyModel>(
      this: ModelStatic<M>,
      values: CreationAttributes<M>,
      options: UpsertOptions<Attributes<M>> = {},
    ): Promise<[M, boolean | null]> {
      return upserter.upsert(this, values as Values, options as UpsertOptions);
    }

    /**
     * Updates all rows matching `where` with one `UPDATE` and refreshes `updatedAt` unless `silent`.
     * Values are validated unless `validate: false`; bulk hooks run unless `hooks: false`.
     *
     * @param this - The model class.
     * @param values - New attribute values.
     * @param options - Update options; `where` is required.
     * @returns `[affectedCount]`, or `[affectedCount, rows]` with `returning: true`.
     * @throws ValidationError when the new values are invalid.
     * @example
     * ```ts
     * const [count] = await Post.update({ published: true }, { where: { userId: 1 } });
     * ```
     */
    static update<M extends AnyModel>(
      this: ModelStatic<M>,
      values: Partial<Attributes<M>>,
      options: UpdateOptions<Attributes<M>>,
    ): Promise<[affectedCount: number, affectedRows?: M[]]> {
      return updater.update(this, values as Values, options as UpdateOptions);
    }

    /**
     * Deletes rows matching `where` and returns the deleted instances (`DELETE ... RETURNING`, a
     * PostgreSQL extension). For paranoid models the rows are soft-deleted unless `force: true`.
     *
     * @param this - The model class.
     * @param options - Destroy options with `returning: true`.
     * @returns Deleted instances.
     * @example
     * ```ts
     * const removed = await Post.destroy({ where: { published: false }, returning: true });
     * ```
     */
    static destroy<M extends AnyModel>(
      this: ModelStatic<M>,
      options: DestroyOptions<Attributes<M>> & Readonly<{ returning: true }>,
    ): Promise<M[]>;

    /**
     * Deletes rows matching `where` (`truncate: true` empties the table instead). For paranoid models
     * the rows are soft-deleted (`deletedAt` is set) unless `force: true`. Runs bulk destroy hooks
     * unless `hooks: false`.
     *
     * @param this - The model class.
     * @param options - Destroy options.
     * @returns Number of deleted rows.
     */
    static destroy<M extends AnyModel>(
      this: ModelStatic<M>,
      options?: DestroyOptions<Attributes<M>>,
    ): Promise<number>;
    static destroy<M extends AnyModel>(
      this: ModelStatic<M>,
      options: DestroyOptions<Attributes<M>> = {},
    ): Promise<number | M[]> {
      return destroyer.destroy(this, options as DestroyOptions);
    }

    /**
     * Restores soft-deleted rows of a paranoid model by setting `deletedAt` back to `NULL`.
     *
     * @param this - The model class.
     * @param options - Rows to restore and hook options.
     * @returns Resolves when done.
     * @throws Error when the model is not paranoid.
     * @example
     * ```ts
     * await Post.restore({ where: { userId: 1 } });
     * ```
     */
    static restore<M extends AnyModel>(
      this: ModelStatic<M>,
      options: RestoreOptions<Attributes<M>> = {},
    ): Promise<void> {
      return destroyer.restore(this, options as RestoreOptions);
    }

    /**
     * Atomically increments numeric attributes of the rows matching `where` (`SET x = x + by`).
     *
     * @param this - The model class.
     * @param fields - Attribute name(s), or a map of attribute to amount.
     * @param options - Increment options (`where`, `by` default 1, `silent`, query options).
     * @returns `[affectedRows, affectedCount]`: the updated instances and their number.
     * @example
     * ```ts
     * await Post.increment('views', { by: 1, where: { id: 5 } });
     * ```
     */
    static increment<M extends AnyModel>(
      this: ModelStatic<M>,
      fields: AttributeAmounts<Attributes<M>>,
      options: IncrementOptions<Attributes<M>> = {},
    ): Promise<[affectedRows: M[], affectedCount: number]> {
      return incrementer.change(
        this,
        fields as AttributeAmounts<Values>,
        options as IncrementOptions,
        1,
      );
    }

    /**
     * Atomically decrements numeric attributes of the rows matching `where` (`SET x = x - by`).
     *
     * @param this - The model class.
     * @param fields - Attribute name(s), or a map of attribute to amount.
     * @param options - Decrement options (`where`, `by` default 1, `silent`, query options).
     * @returns `[affectedRows, affectedCount]`: the updated instances and their number.
     * @example
     * ```ts
     * await Product.decrement({ stock: 3 }, { where: { id: 7 } });
     * ```
     */
    static decrement<M extends AnyModel>(
      this: ModelStatic<M>,
      fields: AttributeAmounts<Attributes<M>>,
      options: IncrementOptions<Attributes<M>> = {},
    ): Promise<[affectedRows: M[], affectedCount: number]> {
      return incrementer.change(
        this,
        fields as AttributeAmounts<Values>,
        options as IncrementOptions,
        -1,
      );
    }
  };
};
