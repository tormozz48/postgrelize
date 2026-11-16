import { IdentifierQuoter } from '../sql/identifier-quoter.ts';
import { AbstractDataType, type DataType, type DataTypeInput } from './abstract-data-type.ts';
import { CompositeFields } from './composite-fields.ts';
import { RecordText } from './record-text.ts';

const quoter = new IdentifierQuoter();
const records = new RecordText();
const fieldCodec = new CompositeFields();

/** Value of a composite column: an object keyed by field name. */
export type CompositeValue = Readonly<Record<string, unknown>>;

/**
 * Composite type (`DataTypes.COMPOSITE('address', { street: DataTypes.TEXT, zip: DataTypes.INTEGER })`);
 * values are objects keyed by field name.
 *
 * @internal
 */
export class CompositeType extends AbstractDataType {
  /** SQL type that `where` parameters are cast to. */
  readonly bindCast: string;
  /** Field types by name, in declaration order. */
  readonly fields: Readonly<Record<string, DataType>>;
  /** Converts driver record text into an object. */
  readonly parse = (value: unknown): unknown => this.#parse(value);
  /** Converts an object into record text bound as one parameter. */
  readonly serialize = (value: unknown): unknown => this.#serialize(value);
  readonly #names: readonly string[];
  readonly #name: string;

  /**
   * @param name - Name of the composite type (quoted as one identifier).
   * @param fields - Field types by field name.
   * @throws Error when there are no fields.
   */
  constructor(name: string, fields: Readonly<Record<string, DataTypeInput>>) {
    const names = Object.keys(fields);
    if (names.length === 0) {
      throw new Error('COMPOSITE needs at least one field');
    }
    super('COMPOSITE', quoter.quote(name));
    this.bindCast = this.sqlType;
    this.#name = name;
    this.#names = names;
    this.fields = Object.fromEntries(
      names.map((field) => [field, AbstractDataType.from(fields[field] as DataTypeInput)]),
    );
    Object.freeze(this);
  }

  /**
   * SQL that creates the type; run it once with `sequelize.query()` before `sync()`.
   *
   * @returns `CREATE TYPE "name" AS ("field" TYPE, …)` with quoted names.
   */
  createSql(): string {
    const columns = this.#names.map(
      (field) => `${quoter.quote(field)} ${this.fields[field]?.sqlType ?? ''}`,
    );
    return `CREATE TYPE ${quoter.quote(this.#name)} AS (${columns.join(', ')})`;
  }

  #serialize(value: unknown): unknown {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return value;
    }
    const source = value as CompositeValue;
    return records.format(
      this.#names.map((field) => fieldCodec.toText(this.fields[field] as DataType, source[field])),
    );
  }

  #parse(value: unknown): unknown {
    if (typeof value !== 'string' || !value.startsWith('(')) {
      return value;
    }
    const texts = records.parse(value);
    return Object.fromEntries(
      this.#names.map((field, index) => [
        field,
        fieldCodec.fromText(this.fields[field] as DataType, texts[index] ?? null),
      ]),
    );
  }
}
