import {
  SqlAst,
  type ExprNode,
  type InsertNode,
  type OnConflictNode,
  type QueryNode,
} from '../sql/ast.ts';
import type { AttributeColumns } from './attribute-columns.ts';
import type { AttributeDefinition, ModelDefinition } from './model-definition.ts';

const ast = new SqlAst();

const isAutoIncrementEmpty = (
  attribute: AttributeDefinition | undefined,
  value: unknown,
): boolean => attribute?.autoIncrement === true && (value === null || value === undefined);

/** Options of {@link InsertQueryBuilder.build}. */
export type InsertBuildOptions = Readonly<{
  /** `true`: all stored columns; a list: these expressions. */
  returning?: boolean | readonly ExprNode[];
  /** `ON CONFLICT` clause. */
  onConflict?: OnConflictNode;
  /** `OVERRIDING { SYSTEM | USER } VALUE`. */
  overriding?: 'system' | 'user';
}>;

/** Builds INSERT statements: multi-row `VALUES` from attribute-keyed rows, or `INSERT ... SELECT`. */
export class InsertQueryBuilder {
  readonly #columns: AttributeColumns;

  /**
   * @param columns - Attribute to column mapping.
   */
  constructor(columns: AttributeColumns) {
    this.#columns = columns;
  }

  /**
   * Builds a multi-row INSERT from attribute-keyed rows. Columns no row provides are left out;
   * missing values and empty auto-increment keys are written as `DEFAULT`.
   *
   * @param definition - Model definition.
   * @param rows - Values by attribute name.
   * @param options - RETURNING, ON CONFLICT, OVERRIDING.
   * @returns INSERT node.
   */
  build(
    definition: ModelDefinition,
    rows: readonly Readonly<Record<string, unknown>>[],
    options: InsertBuildOptions = {},
  ): InsertNode {
    const attributes = this.#insertable(definition, rows);
    const returning = this.#returning(definition, options.returning);
    return {
      kind: 'insert',
      table: this.#columns.table(
        definition,
        options.onConflict === undefined ? undefined : definition.name,
      ),
      columns: attributes.map((name) => definition.attributes.get(name)?.field ?? name),
      rows: this.#rows(definition, rows, attributes),
      ...(options.onConflict === undefined ? {} : { onConflict: options.onConflict }),
      ...(options.overriding === undefined ? {} : { overriding: options.overriding }),
      ...(returning === undefined ? {} : { returning }),
    };
  }

  /**
   * Builds `INSERT INTO ... (columns) SELECT ...`.
   *
   * @param definition - Model definition.
   * @param columns - Target attribute names.
   * @param select - Source query.
   * @param onConflict - `ON CONFLICT` clause.
   * @param returning - RETURNING list.
   * @returns INSERT node.
   */
  fromSelect(
    definition: ModelDefinition,
    columns: readonly string[],
    select: QueryNode,
    onConflict: OnConflictNode | undefined,
    returning: readonly ExprNode[],
  ): InsertNode {
    return {
      kind: 'insert' as const,
      table: this.#columns.table(
        definition,
        onConflict === undefined ? undefined : definition.name,
      ),
      columns: columns.map((name) => definition.attributes.get(name)?.field ?? name),
      rows: [],
      select,
      ...(onConflict === undefined ? {} : { onConflict }),
      returning,
    };
  }

  #insertable(
    definition: ModelDefinition,
    rows: readonly Readonly<Record<string, unknown>>[],
  ): readonly string[] {
    return this.#columns
      .stored(definition)
      .filter((attribute) => attribute.generated === undefined)
      .map((attribute) => attribute.fieldName)
      .filter((name) => rows.some((row) => row[name] !== undefined))
      .filter(
        (name) =>
          !rows.every((row) => isAutoIncrementEmpty(definition.attributes.get(name), row[name])),
      );
  }

  #returning(
    definition: ModelDefinition,
    returning: InsertBuildOptions['returning'],
  ): readonly ExprNode[] | undefined {
    return returning === true
      ? this.#columns.returningAll(definition)
      : returning === false
        ? undefined
        : returning;
  }

  #rows(
    definition: ModelDefinition,
    rows: readonly Readonly<Record<string, unknown>>[],
    attributes: readonly string[],
  ): readonly (readonly ExprNode[])[] {
    const ctx = this.#columns.whereCompiler(definition, undefined);
    return rows.map((row) =>
      attributes.map((name) => {
        const attribute = definition.attributes.get(name);
        const value = row[name];
        return value === undefined || isAutoIncrementEmpty(attribute, value)
          ? ast.raw('DEFAULT')
          : this.#columns.value(attribute, value, ctx);
      }),
    );
  }
}
