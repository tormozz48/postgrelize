import type { FindOptions } from './find-options.ts';
import type { Values } from './options.ts';
import type { QueryOptionsBase } from './runtime.ts';

/**
 * Options of `Model.copyFrom`, which loads rows with `COPY ... FROM STDIN`. PostgreSQL extension.
 *
 * @see {@link Model.copyFrom}
 *
 * @example
 * ```ts
 * const opts: CopyFromOptions<User> = { columns: ['name', 'email'], transaction };
 * await User.copyFrom([{ name: 'Ann', email: 'a@example.com' }], opts);
 * ```
 */
export type CopyFromOptions<T = Values> = QueryOptionsBase &
  Readonly<{
    /** Attributes to copy, in row order; default: keys of the first row of an array source. */
    columns?: readonly (keyof T & string)[];
  }>;

/**
 * Output format options of `Model.copyTo` (`COPY ... TO STDOUT`). PostgreSQL extension.
 *
 * @example
 * ```ts
 * const format: CopyToFormatOptions = { format: 'csv', header: true, delimiter: ';', nullString: '' };
 * ```
 */
export type CopyToFormatOptions = Readonly<{
  /** Output format.
   * @defaultValue 'text' */
  format?: 'text' | 'csv' | 'binary';
  /** Emit a header line (csv).
   * @defaultValue false */
  header?: boolean;
  /** Single-character field delimiter. Default: tab for `text`, comma for `csv`. */
  delimiter?: string;
  /** String written for NULL values. Default: `\N` for `text`, empty for `csv`. */
  nullString?: string;
  /** Single-character quote (csv). Default: `"`. */
  quote?: string;
}>;

/**
 * Options of `Model.copyTo`: a finder query that selects the exported rows plus the output format. PostgreSQL extension.
 *
 * @see {@link Model.copyTo}
 *
 * @example
 * ```ts
 * const opts: CopyToOptions<User> = { where: { active: true }, order: [['id', 'ASC']], format: 'csv', header: true };
 * ```
 */
export type CopyToOptions<T = Values> = FindOptions<T> & CopyToFormatOptions;
