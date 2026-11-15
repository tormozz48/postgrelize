import type { CompiledQuery, SqlCompiler } from '../sql/compile.ts';
import type { InsertQueryBuilder } from './insert-query-builder.ts';
import type { ModelDefinition } from './model-definition.ts';
import type { OnConflictBuilder } from './on-conflict-builder.ts';
import type { BulkCreateOptions } from './options.ts';
import type { UnnestInsertBuilder } from './unnest-insert-builder.ts';

/** Builds the INSERT of `Model.bulkCreate`: multi-row `VALUES`, or `unnest` arrays with `unnest: true`. */
export class BulkInsertBuilder {
  readonly #inserts: InsertQueryBuilder;
  readonly #unnests: UnnestInsertBuilder;
  readonly #conflicts: OnConflictBuilder;
  readonly #compiler: SqlCompiler;

  /**
   * @param inserts - VALUES INSERT builder.
   * @param unnests - `unnest` INSERT builder.
   * @param conflicts - Sequelize v6 conflict options builder.
   * @param compiler - SQL compiler.
   */
  constructor(
    inserts: InsertQueryBuilder,
    unnests: UnnestInsertBuilder,
    conflicts: OnConflictBuilder,
    compiler: SqlCompiler,
  ) {
    this.#inserts = inserts;
    this.#unnests = unnests;
    this.#conflicts = conflicts;
    this.#compiler = compiler;
  }

  /**
   * @param definition - Model definition.
   * @param rows - Values by attribute name.
   * @param options - Bulk create options.
   * @returns The compiled INSERT.
   */
  build(
    definition: ModelDefinition,
    rows: readonly Readonly<Record<string, unknown>>[],
    options: BulkCreateOptions,
  ): CompiledQuery {
    if (options.unnest === true) {
      return this.#unnests.build(definition, rows, options);
    }
    return this.#compiler.compile(
      this.#inserts.build(definition, rows, {
        returning: options.returning !== false,
        ...(options.overriding === undefined ? {} : { overriding: options.overriding }),
        ...this.#conflicts.v6Bulk(definition, options),
      }),
    );
  }
}
