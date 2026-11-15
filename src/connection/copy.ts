/** Value accepted by the COPY text encoder. */
type CopyValue = unknown;

/** Encodes values and rows in PostgreSQL COPY text format. */
export class CopyEncoder {
  readonly #encodeValue = (value: CopyValue): string => this.encodeValue(value);
  readonly #arrayElement = (value: unknown): string =>
    value === null || value === undefined
      ? 'NULL'
      : Array.isArray(value)
        ? this.#arrayLiteral(value)
        : `"${String(value instanceof Date ? value.toISOString() : typeof value === 'object' ? JSON.stringify(value) : value).replace(/["\\]/g, (char) => `\\${char}`)}"`;

  /**
   * Encodes one value in PostgreSQL COPY text format (`\N` for NULL).
   *
   * @param value - Value to encode.
   * @returns Encoded field.
   */
  encodeValue(value: CopyValue): string {
    return CopyEncoder.#raw(value) ?? CopyEncoder.#escapeText(this.#text(value));
  }

  /**
   * Encodes a row (already in column order) as one COPY text line.
   *
   * @param values - Values in column order.
   * @returns Encoded line ending with a newline.
   */
  encodeRow(values: readonly CopyValue[]): string {
    return `${values.map(this.#encodeValue).join('\t')}\n`;
  }

  #text(value: CopyValue): string {
    if (Array.isArray(value)) {
      return this.#arrayLiteral(value);
    }
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }

  // Values with a fixed COPY representation that must not be text-escaped.
  static #raw(value: CopyValue): string | undefined {
    if (value === null || value === undefined) {
      return '\\N';
    }
    if (typeof value === 'boolean') {
      return value ? 't' : 'f';
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    return Buffer.isBuffer(value) ? `\\\\x${value.toString('hex')}` : undefined;
  }

  #arrayLiteral(values: readonly unknown[]): string {
    return `{${values.map(this.#arrayElement).join(',')}}`;
  }

  static #escapeText(text: string): string {
    return text.replace(/[\\\t\n\r]/g, (char) =>
      char === '\\' ? '\\\\' : char === '\t' ? '\\t' : char === '\n' ? '\\n' : '\\r',
    );
  }
}

export { CopyFromStdin } from './copy-from-stdin.ts';
export { CopyToStdout } from './copy-to-stdout.ts';
