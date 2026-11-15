/** Minimal view of the `pg` connection used by COPY TO. */
type CopyOutConnection = Readonly<{
  query: (text: string) => void;
  stream?: Readonly<{ pause: () => unknown; resume: () => unknown }>;
}>;

const HIGH_WATER_MARK = 64;

/** `pg` submittable running `COPY ... TO STDOUT` and exposing the output as an async iterator of chunks. */
export class CopyToStdout {
  /** Completion callback set by `pg`. */
  callback: ((error: Error | null, rowCount?: number) => void) | undefined;
  readonly #text: string;
  #connection: CopyOutConnection | undefined;
  #queue: Buffer[] = [];
  #wake: (() => void) | undefined;
  #finished = false;
  #error: Error | undefined;
  #discard = false;
  #paused = false;
  #rowCount = 0;
  readonly #done: Promise<number>;

  /**
   * @param text - `COPY ... TO STDOUT` statement.
   */
  constructor(text: string) {
    this.#text = text;
    this.#done = new Promise((resolve, reject) => {
      this.callback = (error, rowCount) =>
        error === null ? resolve(rowCount ?? 0) : reject(error);
    });
    this.#done.catch(() => undefined);
  }

  /** Resolves with the copied row count when the server finished. */
  done(): Promise<number> {
    return this.#done;
  }

  /** Output chunks in order; throws the server error, if any. */
  async *chunks(): AsyncGenerator<Buffer, void, undefined> {
    for (;;) {
      const chunk = this.#queue.shift();
      if (chunk !== undefined) {
        this.#resumeIfDrained();
        yield chunk;
        continue;
      }
      if (this.#finished) {
        if (this.#error !== undefined) {
          throw this.#error;
        }
        return;
      }
      await new Promise<void>((resolve) => {
        this.#wake = resolve;
      });
    }
  }

  /** Stops delivering chunks and lets the remaining output drain. */
  discard(): void {
    this.#discard = true;
    this.#queue = [];
    this.#resumeIfDrained();
  }

  /** @internal Called by `pg` to start the query. */
  submit(connection: CopyOutConnection): void {
    this.#connection = connection;
    connection.query(this.#text);
  }

  /** @internal */
  handleCopyData(message: Readonly<{ chunk: Buffer }>): void {
    if (this.#discard) {
      return;
    }
    this.#queue.push(Buffer.from(message.chunk));
    if (this.#queue.length >= HIGH_WATER_MARK && !this.#paused) {
      this.#paused = true;
      this.#connection?.stream?.pause();
    }
    this.#notify();
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
    this.#finish(undefined);
  }

  /** @internal */
  handleCopyInResponse(): void {}

  /** @internal */
  handleRowDescription(): void {}

  /** @internal */
  handleDataRow(): void {}

  /** @internal */
  handleEmptyQuery(): void {}

  /** @internal */
  handlePortalSuspended(): void {}

  #resumeIfDrained(): void {
    if (this.#paused && this.#queue.length < HIGH_WATER_MARK / 2) {
      this.#paused = false;
      this.#connection?.stream?.resume();
    }
  }

  #notify(): void {
    const wake = this.#wake;
    this.#wake = undefined;
    wake?.();
  }

  #finish(error: Error | undefined): void {
    if (this.#finished) {
      return;
    }
    this.#finished = true;
    this.#error = error;
    if (this.#paused) {
      this.#paused = false;
      this.#connection?.stream?.resume();
    }
    this.callback?.(error ?? null, this.#rowCount);
    this.#notify();
  }
}
