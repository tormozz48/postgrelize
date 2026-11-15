import type { FindOptions } from './find-options.ts';
import type { Values } from './options.ts';
import type { QueryOptionsBase } from './runtime.ts';

/** Options of `Model.copyFrom`. PostgreSQL extension. */
export type CopyFromOptions<T = Values> = QueryOptionsBase &
  Readonly<{
    /** Attributes to copy, in row order; default: keys of the first row of an array source. */
    columns?: readonly (keyof T & string)[];
  }>;

/** Output format options of `Model.copyTo`. PostgreSQL extension. */
export type CopyToFormatOptions = Readonly<{
  /** `text` (default), `csv` or `binary`. */
  format?: 'text' | 'csv' | 'binary';
  /** Emit a header line (text / csv). */
  header?: boolean;
  /** Single-character field delimiter. */
  delimiter?: string;
  /** String written for NULL values. */
  nullString?: string;
  /** Single-character quote (csv). */
  quote?: string;
}>;

/** Options of `Model.copyTo`. */
export type CopyToOptions<T = Values> = FindOptions<T> & CopyToFormatOptions;
