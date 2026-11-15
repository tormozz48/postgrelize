type Parsed = readonly (string | null | Parsed)[];

type State = Readonly<{ items: Parsed; index: number }>;

type Token = Readonly<{ value: string; index: number }>;

/**
 * Parses PostgreSQL array literals (`{a,"b c",NULL}`, nested) into strings and nulls.
 *
 * @internal
 */
export class ArrayLiteralParser {
  /**
   * Parses an array literal.
   *
   * @param text - Array literal as returned by the driver.
   * @returns Elements (strings, `null`s and nested arrays); empty when `text` is not an array.
   */
  parse(text: string): Parsed {
    const open = text.indexOf('{');
    return open === -1 ? [] : this.#list(text, open + 1).items;
  }

  #unquoted(text: string, start: number): Token {
    const end = text.slice(start).search(/[,}]/);
    const stop = end === -1 ? text.length : start + end;
    return { value: text.slice(start, stop).trim(), index: stop };
  }

  #quoted(text: string, start: number): Token {
    const read = (index: number, value: string): Token =>
      text[index] === '\\'
        ? read(index + 2, value + (text[index + 1] ?? ''))
        : text[index] === '"' || index >= text.length
          ? { value, index: index + 1 }
          : read(index + 1, value + text[index]);
    return read(start + 1, '');
  }

  #list(text: string, start: number): State {
    return this.#step(text, { items: [], index: start });
  }

  #step(text: string, state: State): State {
    const char = text[state.index];
    if (char === undefined || char === '}') {
      return { items: state.items, index: state.index + 1 };
    }
    if (char === ',' || char === ' ') {
      return this.#step(text, { ...state, index: state.index + 1 });
    }
    return this.#step(text, this.#element(text, state, char));
  }

  #element(text: string, state: State, char: string): State {
    if (char === '{') {
      const nested = this.#list(text, state.index + 1);
      return { items: [...state.items, nested.items], index: nested.index };
    }
    if (char === '"') {
      const item = this.#quoted(text, state.index);
      return { items: [...state.items, item.value], index: item.index };
    }
    const item = this.#unquoted(text, state.index);
    return {
      items: [...state.items, item.value.toUpperCase() === 'NULL' ? null : item.value],
      index: item.index,
    };
  }
}
