type Parsed = readonly (string | null | Parsed)[];

type State = Readonly<{ items: Parsed; index: number }>;

const unquoted = (text: string, start: number): Readonly<{ value: string; index: number }> => {
  const end = text.slice(start).search(/[,}]/);
  const stop = end === -1 ? text.length : start + end;
  return { value: text.slice(start, stop).trim(), index: stop };
};

const quoted = (text: string, start: number): Readonly<{ value: string; index: number }> => {
  const read = (index: number, value: string): Readonly<{ value: string; index: number }> =>
    text[index] === '\\'
      ? read(index + 2, value + (text[index + 1] ?? ''))
      : text[index] === '"' || index >= text.length
        ? { value, index: index + 1 }
        : read(index + 1, value + text[index]);
  return read(start + 1, '');
};

const parseList = (text: string, start: number): State => {
  const step = (state: State): State => {
    const char = text[state.index];
    if (char === undefined || char === '}') {
      return { items: state.items, index: state.index + 1 };
    }
    if (char === ',' || char === ' ') {
      return step({ ...state, index: state.index + 1 });
    }
    if (char === '{') {
      const nested = parseList(text, state.index + 1);
      return step({ items: [...state.items, nested.items], index: nested.index });
    }
    if (char === '"') {
      const item = quoted(text, state.index);
      return step({ items: [...state.items, item.value], index: item.index });
    }
    const item = unquoted(text, state.index);
    return step({
      items: [...state.items, item.value.toUpperCase() === 'NULL' ? null : item.value],
      index: item.index,
    });
  };
  return step({ items: [], index: start });
};

/** Parses a PostgreSQL array literal (`{a,"b c",NULL}`, nested) into strings and nulls. */
export const parseArrayLiteral = (text: string): Parsed => {
  const open = text.indexOf('{');
  return open === -1 ? [] : parseList(text, open + 1).items;
};
