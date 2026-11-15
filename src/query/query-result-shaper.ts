import type { QueryResult } from '../connection/connection-manager.ts';
import type { AnyModel, ModelStatic } from '../model/options.ts';
import type { RowMapper } from '../model/row-mapper.ts';
import type { QueryOptionsBase } from '../model/runtime.ts';
import type { BindParameters, Replacements } from './raw-query.ts';

/** Query types of `sequelize.query` (Sequelize v6 `QueryTypes`). */
export const QueryTypes = {
  /** Returns rows. */
  SELECT: 'SELECT',
  /** Returns `[rows, rowCount]`. */
  INSERT: 'INSERT',
  /** Returns `[rows, rowCount]`. */
  UPDATE: 'UPDATE',
  /** Returns `[undefined, null]` like v6 on PostgreSQL (the statement runs; its rows are not returned). */
  UPSERT: 'UPSERT',
  /** Returns the rows of the statement (`[]` without `RETURNING`). */
  DELETE: 'DELETE',
  /** Returns the number of affected rows. */
  BULKUPDATE: 'BULKUPDATE',
  /** Returns the number of affected rows. */
  BULKDELETE: 'BULKDELETE',
  /** Returns `[rows, result]` (default). */
  RAW: 'RAW',
  /** Returns `[rows, result]`. */
  SHOWTABLES: 'SHOWTABLES',
  /** Returns `[rows, result]`. */
  DESCRIBE: 'DESCRIBE',
  /** Returns `[rows, result]`. */
  VERSION: 'VERSION',
  /** Returns `[rows, result]`. */
  FOREIGNKEYS: 'FOREIGNKEYS',
  /** Returns `[rows, result]`. */
  SHOWINDEXES: 'SHOWINDEXES',
} as const;

/** One of {@link QueryTypes}. */
export type QueryType = (typeof QueryTypes)[keyof typeof QueryTypes];

/**
 * Options of `sequelize.query`, in addition to the common query options such as `transaction` and `logging`.
 *
 * @example
 * ```ts
 * const rows = await sequelize.query('SELECT * FROM users WHERE id = :id', {
 *   type: QueryTypes.SELECT,
 *   replacements: { id: 1 },
 *   model: User,
 *   mapToModel: true,
 * });
 * ```
 */
export type QueryOptions = QueryOptionsBase &
  Readonly<{
    /** Shapes the result; default `RAW`. */
    type?: QueryType;
    /** Values for `?` / `:name` placeholders; bound as parameters. */
    replacements?: Replacements;
    /** Values for `$1` / `$name` placeholders. */
    bind?: BindParameters;
    /** Return only the first row (or `null`). */
    plain?: boolean;
    /** Build instances of this model from SELECT rows. */
    model?: ModelStatic<AnyModel>;
    /** Map column names to attribute names of `model`. */
    mapToModel?: boolean;
    /** Return plain rows even with `model`. */
    raw?: boolean;
  }>;

/**
 * Shapes the result of `sequelize.query` like Sequelize v6: rows (optionally as model instances),
 * `[rows, rowCount]`, a row count or `[rows, result]` depending on the query type.
 */
export class QueryResultShaper {
  readonly #rows: RowMapper;

  /**
   * @param rows - Maps columns to attributes for `mapToModel`.
   */
  constructor(rows: RowMapper) {
    this.#rows = rows;
  }

  /**
   * Query type in effect: the `type` option, or `SELECT` with `model` / `plain`.
   *
   * @param options - Query options.
   * @returns Query type, or `undefined` for RAW.
   */
  type(options: QueryOptions): QueryType | undefined {
    return (
      options.type ??
      (options.model !== undefined || options.plain === true ? QueryTypes.SELECT : undefined)
    );
  }

  /**
   * Shapes a driver result according to the query options.
   *
   * @param result - Driver result.
   * @param options - Query options.
   * @returns Shaped result.
   */
  shape(result: QueryResult, options: QueryOptions): unknown {
    const rows = this.#shapeRows(result, options);
    switch (this.type(options)) {
      case QueryTypes.SELECT:
        return options.plain === true ? (rows[0] ?? null) : rows;
      case QueryTypes.INSERT:
      case QueryTypes.UPDATE:
        return [rows, result.rowCount];
      case QueryTypes.UPSERT:
        return [undefined, null];
      case QueryTypes.DELETE:
        return rows;
      case QueryTypes.BULKDELETE:
      case QueryTypes.BULKUPDATE:
        return result.rowCount;
      default:
        return options.plain === true ? (rows[0] ?? null) : [rows, result];
    }
  }

  #shapeRows(result: QueryResult, options: QueryOptions): readonly unknown[] {
    const model = options.model;
    if (model === undefined || options.raw === true) {
      return result.rows;
    }
    return result.rows.map((row) =>
      model.build(options.mapToModel === true ? this.#rows.parseModel(model, row) : row, {
        isNewRecord: false,
        raw: true,
      }),
    );
  }
}
