import { SqlCompiler } from '../sql/compile.ts';
import { DdlGuards } from './ddl-guards.ts';
import { SqlLiteral, type TableName } from './sql-literal.ts';

const guards = new DdlGuards();

const sqlLiteral = new SqlLiteral();

const DATA_TYPES: ReadonlySet<string> = new Set(['smallint', 'integer', 'bigint']);

/** Whole number accepted in sequence options. */
export type SequenceNumber = number | bigint;

/** Column that owns a sequence (the sequence is dropped with the column). */
export type SequenceOwner = Readonly<{
  /** Owning table. */
  table: TableName;
  /** Owning column. */
  column: string;
}>;

/**
 * Options of `createSequence`. PostgreSQL extension.
 *
 * @example
 * ```ts
 * const options: CreateSequenceOptions = { dataType: 'bigint', start: 1000, cache: 10 };
 * await queryInterface.createSequence('invoice_number', options);
 * ```
 */
export type CreateSequenceOptions = Readonly<{
  /** `AS smallint | integer | bigint`. */
  dataType?: 'smallint' | 'integer' | 'bigint';
  /** `START WITH`. */
  start?: SequenceNumber;
  /** `INCREMENT BY`. */
  increment?: SequenceNumber;
  /** `MINVALUE`; `false` renders `NO MINVALUE`. */
  minValue?: SequenceNumber | false;
  /** `MAXVALUE`; `false` renders `NO MAXVALUE`. */
  maxValue?: SequenceNumber | false;
  /** `CACHE`. */
  cache?: SequenceNumber;
  /** `CYCLE` / `NO CYCLE`. */
  cycle?: boolean;
  /** `OWNED BY table.column`; `null` renders `OWNED BY NONE`. */
  ownedBy?: SequenceOwner | null;
  /** Adds `IF NOT EXISTS`. */
  ifNotExists?: boolean;
}>;

/**
 * Options of `alterSequence`. PostgreSQL extension.
 *
 * @example
 * ```ts
 * const options: AlterSequenceOptions = { restartWith: 1, cycle: true };
 * await queryInterface.alterSequence('invoice_number', options);
 * ```
 */
export type AlterSequenceOptions = Omit<
  CreateSequenceOptions,
  'dataType' | 'start' | 'ifNotExists'
> &
  Readonly<{
    /** `RESTART WITH n`; `true` renders a bare `RESTART` (back to the start value). */
    restartWith?: SequenceNumber | true;
    /** Adds `IF EXISTS`. */
    ifExists?: boolean;
  }>;

/**
 * Options of `dropSequence`. PostgreSQL extension.
 *
 * @example
 * ```ts
 * const options: DropSequenceOptions = { ifExists: true };
 * await queryInterface.dropSequence('invoice_number', options);
 * ```
 */
export type DropSequenceOptions = Readonly<{
  /** Adds `IF EXISTS`. */
  ifExists?: boolean;
  /** Also drops objects that depend on the sequence. */
  cascade?: boolean;
}>;

/**
 * `CREATE`, `ALTER` and `DROP SEQUENCE` statements. Numbers must be whole; names are quoted.
 *
 * @internal
 */
export class SequenceDdl {
  /**
   * `CREATE SEQUENCE` statement.
   *
   * @param name - Sequence name.
   * @param options - Sequence options.
   * @returns Statement.
   * @throws Error for an unknown data type or a non-integer number.
   */
  createSql(name: TableName, options: CreateSequenceOptions): string {
    const type = options.dataType;
    if (type !== undefined && !DATA_TYPES.has(type)) {
      throw new Error(`Invalid sequence data type: ${String(type)}`);
    }
    return [
      `CREATE SEQUENCE ${options.ifNotExists === true ? 'IF NOT EXISTS ' : ''}${sqlLiteral.quoteTable(name)}`,
      type === undefined ? '' : ` AS ${type}`,
      this.#numbers(options),
      options.start === undefined ? '' : ` START WITH ${guards.integer(options.start, 'start')}`,
      this.#tail(options),
    ].join('');
  }

  /**
   * `ALTER SEQUENCE` statement.
   *
   * @param name - Sequence name.
   * @param options - Properties to change.
   * @returns Statement.
   * @throws Error without any property or with a non-integer number.
   */
  alterSql(name: TableName, options: AlterSequenceOptions): string {
    const restart = options.restartWith;
    const parts = [
      this.#numbers(options),
      restart === undefined
        ? ''
        : restart === true
          ? ' RESTART'
          : ` RESTART WITH ${guards.integer(restart, 'restartWith')}`,
      this.#tail(options),
    ].join('');
    if (parts === '') {
      throw new Error('alterSequence requires at least one option');
    }
    return `ALTER SEQUENCE ${options.ifExists === true ? 'IF EXISTS ' : ''}${sqlLiteral.quoteTable(name)}${parts}`;
  }

  /**
   * `DROP SEQUENCE` statement.
   *
   * @param name - Sequence name.
   * @param options - Statement options.
   * @returns Statement.
   */
  dropSql(name: TableName, options: DropSequenceOptions): string {
    return `DROP SEQUENCE ${options.ifExists === true ? 'IF EXISTS ' : ''}${sqlLiteral.quoteTable(name)}${options.cascade === true ? ' CASCADE' : ''}`;
  }

  #numbers(options: AlterSequenceOptions | CreateSequenceOptions): string {
    return [
      options.increment === undefined
        ? ''
        : ` INCREMENT BY ${guards.integer(options.increment, 'increment')}`,
      this.#bound('MINVALUE', options.minValue),
      this.#bound('MAXVALUE', options.maxValue),
    ].join('');
  }

  #bound(keyword: string, value: SequenceNumber | false | undefined): string {
    if (value === undefined) {
      return '';
    }
    return value === false
      ? ` NO ${keyword}`
      : ` ${keyword} ${guards.integer(value, keyword.toLowerCase())}`;
  }

  #tail(options: AlterSequenceOptions | CreateSequenceOptions): string {
    const owner = options.ownedBy;
    return [
      options.cache === undefined ? '' : ` CACHE ${guards.integer(options.cache, 'cache')}`,
      options.cycle === undefined ? '' : options.cycle ? ' CYCLE' : ' NO CYCLE',
      owner === undefined
        ? ''
        : owner === null
          ? ' OWNED BY NONE'
          : ` OWNED BY ${sqlLiteral.quoteTable(owner.table)}.${SqlCompiler.quoteIdent(owner.column)}`,
    ].join('');
  }
}
