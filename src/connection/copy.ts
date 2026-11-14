/** Value accepted by the COPY text encoder. */
type CopyValue = unknown;

const escapeText = (text: string): string =>
  text.replace(/[\\\t\n\r]/g, (char) =>
    char === '\\' ? '\\\\' : char === '\t' ? '\\t' : char === '\n' ? '\\n' : '\\r',
  );

const arrayElement = (value: unknown): string =>
  value === null || value === undefined
    ? 'NULL'
    : Array.isArray(value)
      ? arrayLiteral(value)
      : `"${String(value instanceof Date ? value.toISOString() : typeof value === 'object' ? JSON.stringify(value) : value).replace(/["\\]/g, (char) => `\\${char}`)}"`;

const arrayLiteral = (values: readonly unknown[]): string =>
  `{${values.map(arrayElement).join(',')}}`;

/** Encodes one value in PostgreSQL COPY text format (`\N` for NULL). */
export const encodeCopyValue = (value: CopyValue): string => {
  if (value === null || value === undefined) {
    return '\\N';
  }
  if (typeof value === 'boolean') {
    return value ? 't' : 'f';
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Buffer.isBuffer(value)) {
    return `\\\\x${value.toString('hex')}`;
  }
  if (Array.isArray(value)) {
    return escapeText(arrayLiteral(value));
  }
  if (typeof value === 'object') {
    return escapeText(JSON.stringify(value));
  }
  return escapeText(String(value));
};

/** Encodes a row (already in column order) as one COPY text line. */
export const encodeCopyRow = (values: readonly CopyValue[]): string =>
  `${values.map(encodeCopyValue).join('\t')}\n`;

/** Minimal view of the `pg` connection used by COPY. */
type CopyConnection = Readonly<{
  query: (text: string) => void;
  sendCopyFromChunk: (chunk: Buffer) => unknown;
  endCopyFrom: () => void;
  sendCopyFail: (message: string) => void;
  stream?: Readonly<{
    writableNeedDrain?: boolean;
    once: (event: 'drain', listener: () => void) => unknown;
  }>;
}>;

/**
 * `pg` submittable running `COPY ... FROM STDIN` and streaming text lines produced by `lines`.
 * Resolves with the number of copied rows.
 */
export class CopyFromStdin {
  /** Completion callback set by `pg`. */
  callback: ((error: Error | null, rowCount?: number) => void) | undefined;
  readonly #text: string;
  readonly #lines: AsyncIterable<string>;
  #finished = false;
  #pumping: Promise<void> = Promise.resolve();
  #rowCount = 0;

  /**
   * @param text - `COPY ... FROM STDIN` statement.
   * @param lines - Encoded rows.
   */
  constructor(text: string, lines: AsyncIterable<string>) {
    this.#text = text;
    this.#lines = lines;
  }

  /** Promise resolving with the copied row count. */
  done(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.callback = (error, rowCount) =>
        error === null ? resolve(rowCount ?? 0) : reject(error);
    });
  }

  /** @internal Called by `pg` to start the query. */
  submit(connection: CopyConnection): void {
    connection.query(this.#text);
  }

  /** Resolves when no more data will be written to the connection. */
  settled(): Promise<void> {
    return this.#pumping;
  }

  /** @internal Server is ready to receive data. */
  handleCopyInResponse(connection: CopyConnection): void {
    this.#pumping = this.#pump(connection);
  }

  async #pump(connection: CopyConnection): Promise<void> {
    try {
      for await (const line of this.#lines) {
        if (this.#finished) {
          break;
        }
        connection.sendCopyFromChunk(Buffer.from(line, 'utf8'));
        if (connection.stream?.writableNeedDrain === true) {
          await new Promise<void>((resolve) => connection.stream?.once('drain', resolve));
        }
      }
      connection.endCopyFrom();
    } catch (error) {
      connection.sendCopyFail(error instanceof Error ? error.message : String(error));
    }
  }

  /** @internal */
  handleCommandComplete(message: Readonly<{ text?: string }>): void {
    this.#rowCount = Number(/COPY (\d+)/.exec(message.text ?? '')?.[1] ?? 0);
  }

  /** @internal `pg` detaches the query on error, so report it right away. */
  handleError(error: Error): void {
    this.#finish(error);
  }

  /** @internal */
  handleReadyForQuery(): void {
    this.#finish(null);
  }

  #finish(error: Error | null): void {
    if (!this.#finished) {
      this.#finished = true;
      this.callback?.(error, this.#rowCount);
    }
  }

  /** @internal */
  handleRowDescription(): void {}

  /** @internal */
  handleDataRow(): void {}

  /** @internal */
  handleEmptyQuery(): void {}

  /** @internal */
  handlePortalSuspended(): void {}

  /** @internal */
  handleCopyData(): void {}
}
