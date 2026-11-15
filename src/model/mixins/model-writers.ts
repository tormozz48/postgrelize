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
     * Builds an unsaved instance.
     *
     * @param values - Attribute values.
     * @param options - Build options.
     * @returns New instance.
     */
    static build<M extends AnyModel>(
      this: ModelStatic<M>,
      values?: CreationAttributes<M> | Values,
      options?: BuildOptions,
    ): M {
      return new this(values as Values, options);
    }

    /**
     * Builds several unsaved instances.
     *
     * @param records - Attribute values per instance.
     * @param options - Build options.
     * @returns New instances.
     */
    static bulkBuild<M extends AnyModel>(
      this: ModelStatic<M>,
      records: readonly (CreationAttributes<M> | Values)[],
      options?: BuildOptions,
    ): M[] {
      return records.map((values) => new this(values as Values, options));
    }

    /**
     * Builds and saves an instance.
     *
     * @param values - Attribute values.
     * @param options - Save options.
     * @returns Saved instance.
     * @throws UniqueConstraintError, ForeignKeyConstraintError, DatabaseError.
     */
    static create<M extends AnyModel>(
      this: ModelStatic<M>,
      values?: CreationAttributes<M>,
      options: CreateOptions<Attributes<M>> = {},
    ): Promise<M> {
      return creator.create(this, values as Values | undefined, options as CreateOptions);
    }

    /**
     * Inserts many rows with one statement.
     *
     * @param records - Attribute values per row.
     * @param options - Options.
     * @returns Instances with values returned by the database.
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
     * Inserts a row or updates it when it conflicts with a unique key (Sequelize v6 `upsert`).
     *
     * @param values - Attribute values.
     * @param options - Upsert options.
     * @returns `[instance, null]` like Sequelize v6, or `[instance, created]` with `onConflict`.
     */
    static upsert<M extends AnyModel>(
      this: ModelStatic<M>,
      values: CreationAttributes<M>,
      options: UpsertOptions<Attributes<M>> = {},
    ): Promise<[M, boolean | null]> {
      return upserter.upsert(this, values as Values, options as UpsertOptions);
    }

    /**
     * Updates rows matching `where`.
     *
     * @param values - New attribute values.
     * @param options - Update options.
     * @returns `[affectedCount]`, or `[affectedCount, rows]` with `returning: true`.
     */
    static update<M extends AnyModel>(
      this: ModelStatic<M>,
      values: Partial<Attributes<M>>,
      options: UpdateOptions<Attributes<M>>,
    ): Promise<[affectedCount: number, affectedRows?: M[]]> {
      return updater.update(this, values as Values, options as UpdateOptions);
    }

    /**
     * Deletes rows matching `where`.
     *
     * @param options - Destroy options.
     * @returns Number of deleted rows, or deleted instances with `returning: true`.
     */
    static destroy<M extends AnyModel>(
      this: ModelStatic<M>,
      options: DestroyOptions<Attributes<M>> & Readonly<{ returning: true }>,
    ): Promise<M[]>;

    /**
     * Deletes rows matching `where`.
     *
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
     * Restores soft-deleted rows of a paranoid model (`deletedAt = NULL`).
     *
     * @param options - Rows to restore and hook options.
     * @returns Resolves when done.
     * @throws Error when the model is not paranoid.
     */
    static restore<M extends AnyModel>(
      this: ModelStatic<M>,
      options: RestoreOptions<Attributes<M>> = {},
    ): Promise<void> {
      return destroyer.restore(this, options as RestoreOptions);
    }

    /**
     * Increments attributes of rows matching `where` (`SET x = x + by`).
     *
     * @param fields - Attribute name(s), or a map of attribute to amount.
     * @param options - Increment options.
     * @returns Updated instances.
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
     * Decrements attributes of rows matching `where` (`SET x = x - by`).
     *
     * @param fields - Attribute name(s), or a map of attribute to amount.
     * @param options - Decrement options.
     * @returns Updated instances.
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
