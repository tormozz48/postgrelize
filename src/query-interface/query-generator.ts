import type { FindOptions, ModelStatic, AnyModel } from '../model/options.ts';
import { finder } from '../model/model-operations.ts';

/**
 * Sequelize v6 `queryInterface.queryGenerator`: renders finder options to SQL text. Only
 * {@link QueryGenerator.selectQuery} is provided; postgrelize compiles its SQL through its own AST.
 *
 * @example
 * ```ts
 * const sql = sequelize.getQueryInterface().queryGenerator.selectQuery('users', { where: { id: 1 } }, User);
 * ```
 */
export class QueryGenerator {
  /**
   * Renders the SELECT of a finder without running it. Values are written into the text as escaped
   * literals like v6. No scope, `paranoid` filter or hook is applied, as in v6.
   *
   * @param tableName - Table name; ignored, the table of `model` is used.
   * @param options - Finder options (`attributes`, `where`, `include`, `order`, `limit`, ...).
   * @param model - Model whose table is selected from.
   * @returns SQL ending with `;`.
   * @throws Error when `model` is missing.
   * @example
   * ```ts
   * const sql = sequelize.getQueryInterface().queryGenerator.selectQuery('users', { where: { id: 1 } }, User);
   * ```
   */
  selectQuery(
    tableName: unknown,
    options: FindOptions = {},
    model?: ModelStatic<AnyModel>,
  ): string {
    if (model === undefined) {
      throw new Error(
        `selectQuery needs the model of "${String(tableName)}" as the third argument`,
      );
    }
    return finder.selectSql(model, options);
  }
}
