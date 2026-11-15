import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { CopyFromStdin } from '../../../src/connection/copy-from-stdin.ts';
import { CopyToStdout } from '../../../src/connection/copy-to-stdout.ts';

async function* lines(values: string[]): AsyncGenerator<string> {
  for (const value of values) {
    yield await Promise.resolve(value);
  }
}

const connectionStub = (stream?: EventEmitter & { writableNeedDrain?: boolean }) => ({
  query: vi.fn<(...args: unknown[]) => unknown>(),
  sendCopyFromChunk: vi.fn<(...args: unknown[]) => unknown>(),
  endCopyFrom: vi.fn<(...args: unknown[]) => unknown>(),
  sendCopyFail: vi.fn<(...args: unknown[]) => unknown>(),
  stream,
});

async function* broken(): AsyncGenerator<string> {
  yield await Promise.resolve('a\n');
  throw new Error('source failed');
}
async function* thrower(): AsyncGenerator<string> {
  await Promise.resolve();
  yield* [];
  throw 'plain string';
}
describe('CopyFromStdin', () => {
  it('submits the statement, streams chunks, ends and resolves with the server row count', async () => {
    const copy = new CopyFromStdin('COPY t FROM STDIN', lines(['a\n', 'b\n']));
    const done = copy.done();
    const connection = connectionStub();
    copy.submit(connection);
    expect(connection.query).toHaveBeenCalledWith('COPY t FROM STDIN');
    copy.handleCopyInResponse(connection);
    await copy.settled();
    expect(connection.sendCopyFromChunk.mock.calls.map(([chunk]) => String(chunk))).toEqual([
      'a\n',
      'b\n',
    ]);
    expect(connection.endCopyFrom).toHaveBeenCalledTimes(1);
    copy.handleCommandComplete({ text: 'COPY 2' });
    copy.handleReadyForQuery();
    await expect(done).resolves.toBe(2);
  });

  it('resolves with 0 when the command tag carries no count', async () => {
    const copy = new CopyFromStdin('COPY t FROM STDIN', lines([]));
    const done = copy.done();
    copy.handleCommandComplete({});
    copy.handleReadyForQuery();
    await expect(done).resolves.toBe(0);
  });

  it('waits for drain when the socket buffer is full', async () => {
    const stream = Object.assign(new EventEmitter(), { writableNeedDrain: true });
    const connection = connectionStub(stream);
    const copy = new CopyFromStdin('COPY t FROM STDIN', lines(['a\n']));
    copy.handleCopyInResponse(connection);
    let settled = false;
    void copy.settled().then(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(stream.listenerCount('drain')).toBe(1));
    expect(settled).toBe(false);
    expect(connection.endCopyFrom).not.toHaveBeenCalled();
    stream.emit('drain');
    await copy.settled();
    expect(connection.endCopyFrom).toHaveBeenCalledTimes(1);
  });

  it('sends CopyFail with the error message when the row source throws', async () => {
    const connection = connectionStub();
    const copy = new CopyFromStdin('COPY t FROM STDIN', broken());
    copy.handleCopyInResponse(connection);
    await copy.settled();
    expect(connection.sendCopyFail).toHaveBeenCalledWith('source failed');
    expect(connection.endCopyFrom).not.toHaveBeenCalled();

    const other = connectionStub();
    const second = new CopyFromStdin('COPY t FROM STDIN', thrower());
    second.handleCopyInResponse(other);
    await second.settled();
    expect(other.sendCopyFail).toHaveBeenCalledWith('plain string');
  });

  it('reports a server error once and stops pumping rows', async () => {
    const copy = new CopyFromStdin('COPY t FROM STDIN', lines(['a\n', 'b\n']));
    const done = copy.done();
    const failure = new Error('constraint violated');
    copy.handleError(failure);
    copy.handleReadyForQuery();
    await expect(done).rejects.toBe(failure);
    const connection = connectionStub();
    copy.handleCopyInResponse(connection);
    await copy.settled();
    expect(connection.sendCopyFromChunk).not.toHaveBeenCalled();
  });

  it('ignores protocol messages that are irrelevant to COPY', async () => {
    const copy = new CopyFromStdin('COPY t FROM STDIN', lines([]));
    const done = copy.done();
    copy.handleRowDescription();
    copy.handleDataRow();
    copy.handleEmptyQuery();
    copy.handlePortalSuspended();
    copy.handleCopyData();
    copy.handleCommandComplete({ text: 'COPY 5' });
    copy.handleReadyForQuery();
    await expect(done).resolves.toBe(5);
  });
});

const chunk = (text: string) => ({ chunk: Buffer.from(text) });

describe('CopyToStdout', () => {
  it('yields queued chunks in order and resolves with the row count', async () => {
    const copy = new CopyToStdout('COPY t TO STDOUT');
    const connection = { query: vi.fn<(...args: unknown[]) => unknown>() };
    copy.submit(connection);
    expect(connection.query).toHaveBeenCalledWith('COPY t TO STDOUT');
    copy.handleCopyData(chunk('a'));
    copy.handleCopyData(chunk('b'));
    copy.handleCommandComplete({ text: 'COPY 2' });
    copy.handleReadyForQuery();
    const received: string[] = [];
    for await (const part of copy.chunks()) {
      received.push(part.toString());
    }
    expect(received).toEqual(['a', 'b']);
    await expect(copy.done()).resolves.toBe(2);
  });

  it('wakes a waiting consumer when data arrives later', async () => {
    const copy = new CopyToStdout('COPY t TO STDOUT');
    const iterator = copy.chunks();
    const next = iterator.next();
    copy.handleCopyData(chunk('late'));
    expect((await next).value?.toString()).toBe('late');
    copy.handleReadyForQuery();
    expect((await iterator.next()).done).toBe(true);
  });

  it('pauses the socket above the high-water mark and resumes once drained', async () => {
    const copy = new CopyToStdout('COPY t TO STDOUT');
    const stream = {
      pause: vi.fn<(...args: unknown[]) => unknown>(),
      resume: vi.fn<(...args: unknown[]) => unknown>(),
    };
    copy.submit({ query: vi.fn<(...args: unknown[]) => unknown>(), stream });
    for (let index = 0; index < 64; index += 1) {
      copy.handleCopyData(chunk(String(index)));
    }
    expect(stream.pause).toHaveBeenCalledTimes(1);
    copy.handleCopyData(chunk('extra'));
    expect(stream.pause).toHaveBeenCalledTimes(1);
    const iterator = copy.chunks();
    for (let index = 0; index < 33; index += 1) {
      await iterator.next();
    }
    expect(stream.resume).not.toHaveBeenCalled();
    await iterator.next();
    expect(stream.resume).toHaveBeenCalledTimes(1);
    copy.handleReadyForQuery();
  });

  it('resumes a paused socket when the server finishes', () => {
    const copy = new CopyToStdout('COPY t TO STDOUT');
    const stream = {
      pause: vi.fn<(...args: unknown[]) => unknown>(),
      resume: vi.fn<(...args: unknown[]) => unknown>(),
    };
    copy.submit({ query: vi.fn<(...args: unknown[]) => unknown>(), stream });
    for (let index = 0; index < 64; index += 1) {
      copy.handleCopyData(chunk(String(index)));
    }
    copy.handleError(new Error('cancelled'));
    expect(stream.resume).toHaveBeenCalledTimes(1);
    copy.handleReadyForQuery();
  });

  it('discards queued and future output and resumes a paused socket', async () => {
    const copy = new CopyToStdout('COPY t TO STDOUT');
    const stream = {
      pause: vi.fn<(...args: unknown[]) => unknown>(),
      resume: vi.fn<(...args: unknown[]) => unknown>(),
    };
    copy.submit({ query: vi.fn<(...args: unknown[]) => unknown>(), stream });
    for (let index = 0; index < 64; index += 1) {
      copy.handleCopyData(chunk(String(index)));
    }
    copy.discard();
    expect(stream.resume).toHaveBeenCalledTimes(1);
    copy.handleCopyData(chunk('ignored'));
    copy.handleCommandComplete({ text: 'COPY 65' });
    copy.handleReadyForQuery();
    const received: Buffer[] = [];
    for await (const part of copy.chunks()) {
      received.push(part);
    }
    expect(received).toEqual([]);
    await expect(copy.done()).resolves.toBe(65);
  });

  it('throws the server error after the queued chunks and rejects done()', async () => {
    const copy = new CopyToStdout('COPY t TO STDOUT');
    copy.handleCopyData(chunk('a'));
    const failure = new Error('relation vanished');
    copy.handleError(failure);
    copy.handleReadyForQuery();
    const received: string[] = [];
    const consume = async (): Promise<void> => {
      for await (const part of copy.chunks()) {
        received.push(part.toString());
      }
    };
    await expect(consume()).rejects.toBe(failure);
    expect(received).toEqual(['a']);
    await expect(copy.done()).rejects.toBe(failure);
  });

  it('ignores protocol messages that are irrelevant to COPY', async () => {
    const copy = new CopyToStdout('COPY t TO STDOUT');
    copy.handleCopyInResponse();
    copy.handleRowDescription();
    copy.handleDataRow();
    copy.handleEmptyQuery();
    copy.handlePortalSuspended();
    copy.handleReadyForQuery();
    await expect(copy.done()).resolves.toBe(0);
  });
});
