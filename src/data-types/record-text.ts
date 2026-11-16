const SPECIAL = /[\s"\\(),]/;

/**
 * Reads and writes the text form of a composite value, `(1,"a b",)`.
 *
 * @internal
 */
export class RecordText {
  /**
   * Splits record text into field texts.
   *
   * @param text - Record text, e.g. `(1,"say ""hi""",)`.
   * @returns One entry per field; `null` for an empty (NULL) field.
   */
  parse(text: string): (string | null)[] {
    const fields: (string | null)[] = [];
    const body = text.slice(1, -1);
    let index = 0;
    for (;;) {
      const [value, next] = body.startsWith('"', index)
        ? this.#quoted(body, index + 1)
        : this.#plain(body, index);
      fields.push(value);
      if (next >= body.length) {
        return fields;
      }
      index = next + 1;
    }
  }

  /**
   * Writes field texts as record text.
   *
   * @param fields - Field texts; `null` is written as an empty field.
   * @returns Record text.
   */
  format(fields: readonly (string | null)[]): string {
    return `(${fields.map((field) => this.quote(field)).join(',')})`;
  }

  /**
   * Quotes one field when it needs it.
   *
   * @param field - Field text or `null`.
   * @returns Field text for use inside a record or array literal.
   */
  quote(field: string | null): string {
    if (field === null) {
      return '';
    }
    return field === '' || SPECIAL.test(field)
      ? `"${field.replaceAll('\\', '\\\\').replaceAll('"', '""')}"`
      : field;
  }

  #plain(body: string, from: number): [string | null, number] {
    const end = body.indexOf(',', from);
    const stop = end === -1 ? body.length : end;
    return [from === stop ? null : body.slice(from, stop), stop];
  }

  #quoted(body: string, from: number): [string, number] {
    let value = '';
    let index = from;
    while (index < body.length) {
      const char = body[index] ?? '';
      if (char === '"' && body[index + 1] === '"') {
        value += '"';
        index += 2;
      } else if (char === '"') {
        return [value, index + 1];
      } else {
        value += char === '\\' ? (body[++index] ?? '') : char;
        index += 1;
      }
    }
    return [value, index];
  }
}
