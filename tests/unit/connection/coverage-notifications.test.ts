import { EventEmitter } from 'node:events';
import type { Client as PgClient } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationListener } from '../../../src/connection/notifications.ts';

class StubClient extends EventEmitter {
  readonly sent: string[] = [];
  get statements(): string[] {
    return [...new Set(this.sent)];
  }
  ended = false;
  query(text: string): Promise<void> {
    this.sent.push(text);
    return Promise.resolve();
  }
  end(): Promise<void> {
    this.ended = true;
    return Promise.resolve();
  }
}

const asClient = (client: StubClient): PgClient => client as unknown as PgClient;

const flush = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0);
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('NotificationListener', () => {
  it('shares one connection between channels and handlers and dispatches payloads', async () => {
    const client = new StubClient();
    const connect = vi.fn<() => Promise<PgClient>>(() => Promise.resolve(asClient(client)));
    const listener = new NotificationListener(connect);
    const first = vi.fn<(...args: unknown[]) => unknown>();
    const second = vi.fn<(...args: unknown[]) => unknown>();
    await listener.listen('a', first);
    await listener.listen('a', second);
    await listener.listen('b "q"', first);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(client.statements).toEqual(['LISTEN "a"', 'LISTEN "b ""q"""']);

    client.emit('notification', { channel: 'a', payload: 'hello' });
    client.emit('notification', { channel: 'unknown', payload: 'ignored' });
    client.emit('notification', { channel: 'a' });
    await flush();
    expect(first).toHaveBeenCalledWith('hello', 'a');
    expect(second).toHaveBeenCalledWith('hello', 'a');
    expect(second).toHaveBeenCalledWith(undefined, 'a');
    expect(first).toHaveBeenCalledTimes(2);
    await listener.close();
  });

  it('survives throwing and rejecting handlers and keeps delivering to the others', async () => {
    const client = new StubClient();
    const listener = new NotificationListener(() => Promise.resolve(asClient(client)));
    const good = vi.fn<(...args: unknown[]) => unknown>();
    await listener.listen('a', () => {
      throw new Error('boom');
    });
    await listener.listen('a', () => Promise.reject(new Error('async boom')));
    await listener.listen('a', good);
    client.emit('notification', { channel: 'a', payload: 'x' });
    client.emit('error', new Error('connection error is swallowed'));
    await flush();
    expect(good).toHaveBeenCalledWith('x', 'a');
    await listener.close();
  });

  it('issues UNLISTEN only when the last handler of a channel leaves', async () => {
    const client = new StubClient();
    const listener = new NotificationListener(() => Promise.resolve(asClient(client)));
    const first = vi.fn<(...args: unknown[]) => unknown>();
    const second = vi.fn<(...args: unknown[]) => unknown>();
    const offFirst = await listener.listen('a', first);
    const offSecond = await listener.listen('a', second);
    await offFirst();
    expect(client.statements).toEqual(['LISTEN "a"']);
    client.emit('notification', { channel: 'a', payload: 'x' });
    await flush();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    await offSecond();
    expect(client.statements).toEqual(['LISTEN "a"', 'UNLISTEN "a"']);
    await offSecond();
    expect(client.statements).toEqual(['LISTEN "a"', 'UNLISTEN "a"']);
    await listener.close();
  });

  it('does nothing when unsubscribing after close', async () => {
    const client = new StubClient();
    const listener = new NotificationListener(() => Promise.resolve(asClient(client)));
    const off = await listener.listen('a', vi.fn<(...args: unknown[]) => unknown>());
    await listener.close();
    expect(client.ended).toBe(true);
    await off();
    expect(client.statements).toEqual(['LISTEN "a"']);
  });

  it('closes cleanly when nothing was ever opened or the connection failed', async () => {
    await new NotificationListener(() => Promise.reject(new Error('never'))).close();
    const failing = new NotificationListener(() => Promise.reject(new Error('refused')));
    await expect(failing.listen('a', vi.fn<(...args: unknown[]) => unknown>())).rejects.toThrow(
      'refused',
    );
    await failing.close();
  });

  it('reconnects after the connection ends and re-subscribes every channel', async () => {
    const clients = [new StubClient(), new StubClient()];
    let opened = 0;
    const connect = vi.fn<() => Promise<PgClient>>(() => {
      opened += 1;
      return Promise.resolve(asClient(clients[opened - 1]!));
    });
    const listener = new NotificationListener(connect);
    const handler = vi.fn<(...args: unknown[]) => unknown>();
    await listener.listen('a', handler);
    await listener.listen('b', handler);

    clients[0]!.emit('end');
    expect(connect).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(connect).toHaveBeenCalledTimes(2);
    expect(clients[1]!.statements).toEqual(['LISTEN "a"', 'LISTEN "b"']);

    clients[1]!.emit('notification', { channel: 'b', payload: 'again' });
    await flush();
    expect(handler).toHaveBeenCalledWith('again', 'b');
    await listener.close();
  });

  it('keeps retrying after a failed reconnect attempt until the server is back', async () => {
    const first = new StubClient();
    const recovered = new StubClient();
    let attempts = 0;
    const connect = vi.fn<() => Promise<PgClient>>(() => {
      attempts += 1;
      if (attempts === 1) {
        return Promise.resolve(asClient(first));
      }
      return attempts < 3
        ? Promise.reject(new Error('down'))
        : Promise.resolve(asClient(recovered));
    });
    const listener = new NotificationListener(connect);
    await listener.listen('a', vi.fn<(...args: unknown[]) => unknown>());
    first.emit('end');
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(connect).toHaveBeenCalledTimes(3);
    expect(recovered.statements).toEqual(['LISTEN "a"']);
    await listener.close();
  });

  it('retries after a failed reconnect attempt and stops once closed', async () => {
    const first = new StubClient();
    const connect = vi
      .fn<() => Promise<PgClient>>()
      .mockResolvedValueOnce(asClient(first))
      .mockRejectedValue(new Error('down'));
    const listener = new NotificationListener(connect);
    await listener.listen('a', vi.fn<(...args: unknown[]) => unknown>());
    first.emit('end');
    await vi.advanceTimersByTimeAsync(1000);
    expect(connect).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    await listener.close();
    const calls = connect.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(connect).toHaveBeenCalledTimes(calls);
  });

  it('does not reconnect when no subscription is left', async () => {
    const client = new StubClient();
    const connect = vi.fn<() => Promise<PgClient>>(() => Promise.resolve(asClient(client)));
    const listener = new NotificationListener(connect);
    const off = await listener.listen('a', vi.fn<(...args: unknown[]) => unknown>());
    await off();
    client.emit('end');
    await vi.advanceTimersByTimeAsync(5000);
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('does not retry a pending reconnect once the listener is closed', async () => {
    const client = new StubClient();
    const connect = vi.fn<() => Promise<PgClient>>(() => Promise.resolve(asClient(client)));
    const listener = new NotificationListener(connect);
    await listener.listen('a', vi.fn<(...args: unknown[]) => unknown>());
    client.emit('end');
    await listener.close();
    await vi.advanceTimersByTimeAsync(5000);
    expect(connect).toHaveBeenCalledTimes(1);
  });
});
