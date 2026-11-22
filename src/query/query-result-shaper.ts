import type { QueryResult } from '../connection/connection-manager.ts';
import type { AnyModel, ModelStatic, Values } from '../model/options.ts';
import type { RowMapper } from '../model/row-mapper.ts';
import type { QueryOptionsBase } from '../model/runtime.ts';
import type { ColumnDescription } from '../query-interface/query-interface.ts';
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
  /** Returns `[rows, result]`. */
  SHOWCONSTRAINTS: 'SHOWCONSTRAINTS',
} as const;

/** One of {@link QueryTypes}. */
export type QueryType = (typeof QueryTypes)[keyof typeof QueryTypes];

/** `QueryTypes` is also a type, as the v6 enum is: the union of the query type names. */
export type QueryTypes = QueryType;

/** Member types of {@link QueryTypes}, so `QueryTypes.SELECT` works in type positions like the v6 enum members. */
// oxlint-disable-next-line typescript/no-namespace, typescript/no-redeclare -- merges the v6 enum's type members into the constant.
export declare namespace QueryTypes {
  /** Type of `QueryTypes.SELECT`. */
  type SELECT = typeof QueryTypes.SELECT;
  /** Type of `QueryTypes.INSERT`. */
  type INSERT = typeof QueryTypes.INSERT;
  /** Type of `QueryTypes.UPDATE`. */
  type UPDATE = typeof QueryTypes.UPDATE;
  /** Type of `QueryTypes.BULKUPDATE`. */
  type BULKUPDATE = typeof QueryTypes.BULKUPDATE;
  /** Type of `QueryTypes.BULKDELETE`. */
  type BULKDELETE = typeof QueryTypes.BULKDELETE;
  /** Type of `QueryTypes.DELETE`. */
  type DELETE = typeof QueryTypes.DELETE;
  /** Type of `QueryTypes.UPSERT`. */
  type UPSERT = typeof QueryTypes.UPSERT;
  /** Type of `QueryTypes.VERSION`. */
  type VERSION = typeof QueryTypes.VERSION;
  /** Type of `QueryTypes.SHOWTABLES`. */
  type SHOWTABLES = typeof QueryTypes.SHOWTABLES;
  /** Type of `QueryTypes.SHOWINDEXES`. */
  type SHOWINDEXES = typeof QueryTypes.SHOWINDEXES;
  /** Type of `QueryTypes.SHOWCONSTRAINTS`. */
  type SHOWCONSTRAINTS = typeof QueryTypes.SHOWCONSTRAINTS;
  /** Type of `QueryTypes.DESCRIBE`. */
  type DESCRIBE = typeof QueryTypes.DESCRIBE;
  /** Type of `QueryTypes.RAW`. */
  type RAW = typeof QueryTypes.RAW;
  /** Type of `QueryTypes.FOREIGNKEYS`. */
  type FOREIGNKEYS = typeof QueryTypes.FOREIGNKEYS;
}

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
    /** Nests `a.b` keys of the rows into objects (`{ a: { b } }`); implies `type: SELECT` unless a type is given. */
    nest?: boolean;
  }>;

/**
 * Result types of `sequelize.query` per query `type`, as the Sequelize v6 typings declare them.
 *
 * @example
 * ```ts
 * type Updated = TypedQueryResults['UPDATE']; // [undefined, number]
 * ```
 */
export type TypedQueryResults = {
  /** `QueryTypes.UPDATE`. */
  UPDATE: [undefined, number];
  /** `QueryTypes.BULKUPDATE`: affected rows. */
  BULKUPDATE: number;
  /** `QueryTypes.INSERT`. */
  INSERT: [number, number];
  /** `QueryTypes.UPSERT`. */
  UPSERT: number;
  /** `QueryTypes.DELETE`. */
  DELETE: void;
  /** `QueryTypes.BULKDELETE`: affected rows. */
  BULKDELETE: number;
  /** `QueryTypes.SHOWTABLES`: table names. */
  SHOWTABLES: string[];
  /** `QueryTypes.DESCRIBE`: column descriptions by column name. */
  DESCRIBE: Record<string, ColumnDescription>;
};

/**
 * {@link QueryOptions} with a required query `type` (Sequelize v6 `QueryOptionsWithType`).
 *
 * @typeParam T - The query type, e.g. `QueryTypes.SELECT`.
 *
 * @example
 * ```ts
 * const options: QueryOptionsWithType<QueryTypes.SELECT> = { type: QueryTypes.SELECT };
 * const rows = await sequelize.query('SELECT 1 AS one', options);
 * ```
 */
export type QueryOptionsWithType<T extends QueryType> = QueryOptions &
  Readonly<{
    /** The query type. */
    type: T;
  }>;

/**
 * {@link QueryOptions} with a required `model` (Sequelize v6 `QueryOptionsWithModel`): the rows become instances of it.
 *
 * @typeParam M - The model instance type.
 *
 * @example
 * ```ts
 * const options: QueryOptionsWithModel<Model> = { model: User, mapToModel: true };
 * const users = await sequelize.query('SELECT * FROM users', options);
 * ```
 */
export type QueryOptionsWithModel<M extends AnyModel> = QueryOptions &
  Readonly<{
    /** Model the rows are built as. */
    model: ModelStatic<M>;
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
      (options.model !== undefined || options.plain === true || options.nest === true
        ? QueryTypes.SELECT
        : undefined)
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
      return options.nest === true
        ? result.rows.map((row) => this.#rows.nest(row as Values))
        : result.rows;
    }
    return result.rows.map((row) =>
      model.build(options.mapToModel === true ? this.#rows.parseModel(model, row) : row, {
        isNewRecord: false,
        raw: true,
      }),
    );
  }
}
