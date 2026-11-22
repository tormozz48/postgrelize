import { afterEach, describe, expect, it, vi } from 'vitest';
import { RetryRunner, type RetryOptions } from '../../../src/connection/retry.ts';
import {
  ConnectionError,
  ConnectionRefusedError,
  ConnectionTimedOutError,
  ConnectionAcquireTimeoutError,
  HostNotFoundError,
  HostNotReachableError,
  InvalidConnectionError,
} from '../../../src/index.ts';
import { PgErrorMapper } from '../../../src/errors/map-pg-error.ts';

afterEach(() => {
  vi.useRealTimers();
});

const failing = (error: unknown, times: number) => {
  let calls = 0;
  const task = async (): Promise<string> => {
    calls += 1;
    if (calls <= times) {
      throw error;
    }
    return 'done';
  };
  return { task, calls: () => calls };
};

const run = (options: RetryOptions, error: unknown, times: number, defaults?: RetryOptions) => {
  const { task, calls } = failing(error, times);
  const result = new RetryRunner(defaults).run(task, options);
  return { result, calls };
};

const attempts = async (match: RetryOptions['match'], error: unknown): Promise<number> => {
  const { result, calls } = run({ max: 2, match, backoffBase: 0 }, error, 1);
  await result.catch(() => undefined);
  return calls();
};

const refused = (): ConnectionRefusedError =>
  new ConnectionRefusedError(Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:1'), {}));

describe('RetryRunner', () => {
  it('runs the task once and untouched when nothing is configured', async () => {
    const runner = new RetryRunner(undefined);
    expect(runner.active(undefined)).toBe(false);
    const { task, calls } = failing(new Error('boom'), 1);
    await expect(runner.run(task)).rejects.toThrow('boom');
    expect(calls()).toBe(1);
  });

  it('does not retry without max (v6: max is required)', async () => {
    const { result, calls } = run({ match: [/boom/], backoffBase: 0 }, new Error('boom'), 1);
    await expect(result).rejects.toThrow('boom');
    expect(calls()).toBe(1);
  });

  it('retries a matching error until the task succeeds', async () => {
    const { result, calls } = run(
      { max: 5, match: [/boom/], backoffBase: 0 },
      new Error('boom'),
      2,
    );
    await expect(result).resolves.toBe('done');
    expect(calls()).toBe(3);
  });

  it('makes at most max attempts and rethrows the last error', async () => {
    const { result, calls } = run(
      { max: 3, match: [/boom/], backoffBase: 0 },
      new Error('boom'),
      10,
    );
    await expect(result).rejects.toThrow('boom');
    expect(calls()).toBe(3);
  });

  it('does not retry an error that matches nothing', async () => {
    const { result, calls } = run(
      { max: 5, match: [/other/], backoffBase: 0 },
      new Error('boom'),
      1,
    );
    await expect(result).rejects.toThrow('boom');
    expect(calls()).toBe(1);
  });

  it('retries every error when match is empty or missing (v6)', async () => {
    const empty = run({ max: 3, match: [], backoffBase: 0 }, new Error('x'), 1);
    await expect(empty.result).resolves.toBe('done');
    const missing = run({ max: 3, backoffBase: 0 }, new Error('x'), 1);
    await expect(missing.result).resolves.toBe('done');
  });

  describe('match entries', () => {
    it('compares a string with the message and with toString()', async () => {
      expect(await attempts(['boom'], new Error('boom'))).toBe(2);
      expect(await attempts(['Error: boom'], new Error('boom'))).toBe(2);
      expect(await attempts(['oom'], new Error('boom'))).toBe(1);
    });

    it('tests a regular expression against the message and toString()', async () => {
      expect(await attempts([/^bo+m$/], new Error('boom'))).toBe(2);
      expect(await attempts([/^Error: boom$/], new Error('boom'))).toBe(2);
      expect(await attempts([/bang/], new Error('boom'))).toBe(1);
    });

    it('matches a v6 error name through toString()', async () => {
      expect(await attempts([/SequelizeConnectionRefusedError/], refused())).toBe(2);
      expect(await attempts(['SequelizeConnectionRefusedError'], refused())).toBe(1);
    });

    it('matches an error class with instanceof', async () => {
      expect(await attempts([ConnectionError], refused())).toBe(2);
      expect(await attempts([TypeError], new Error('boom'))).toBe(1);
    });

    it('calls an arrow function as a predicate', async () => {
      expect(
        await attempts(
          [(error: unknown) => (error as Error).message === 'boom'],
          new Error('boom'),
        ),
      ).toBe(2);
      expect(await attempts([() => false], new Error('boom'))).toBe(1);
    });

    it('handles values that are not errors', async () => {
      expect(await attempts(['plain'], 'plain')).toBe(2);
      expect(await attempts([/nothing/], undefined)).toBe(1);
    });
  });

  it('merges the per-call option over the instance option', async () => {
    const defaults: RetryOptions = { max: 1, match: [/boom/], backoffBase: 0 };
    const overridden = run({ max: 4 }, new Error('boom'), 3, defaults);
    await expect(overridden.result).resolves.toBe('done');
    expect(overridden.calls()).toBe(4);
    const inherited = new RetryRunner(defaults);
    const { task, calls } = failing(new Error('boom'), 3);
    await expect(inherited.run(task)).rejects.toThrow('boom');
    expect(calls()).toBe(1);
  });

  it('waits backoffBase * backoffExponent ** (attempt - 1) between attempts', async () => {
    vi.useFakeTimers();
    const { result, calls } = run(
      { max: 4, match: [/boom/], backoffBase: 100, backoffExponent: 2 },
      new Error('boom'),
      3,
    );
    await vi.advanceTimersByTimeAsync(99);
    expect(calls()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls()).toBe(2);
    await vi.advanceTimersByTimeAsync(199);
    expect(calls()).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls()).toBe(3);
    await vi.advanceTimersByTimeAsync(400);
    await expect(result).resolves.toBe('done');
  });

  it('defaults to a 100 ms base and a 1.1 exponent', async () => {
    vi.useFakeTimers();
    const { result, calls } = run({ max: 3, match: [/boom/] }, new Error('boom'), 2);
    await vi.advanceTimersByTimeAsync(99);
    expect(calls()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls()).toBe(2);
    await vi.advanceTimersByTimeAsync(109);
    expect(calls()).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe('done');
  });

  it('keeps the jittered delay within the jitter range', async () => {
    vi.useFakeTimers();
    const { result, calls } = run(
      { max: 2, match: [/boom/], backoffBase: 100, backoffJitter: 10 },
      new Error('boom'),
      1,
    );
    await vi.advanceTimersByTimeAsync(89);
    expect(calls()).toBe(1);
    await vi.advanceTimersByTimeAsync(21);
    await expect(result).resolves.toBe('done');
  });

  it('rejects an attempt that exceeds timeout with a TimeoutError and does not retry it', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const result = new RetryRunner(undefined).run(
      () => {
        calls += 1;
        return new Promise<string>(() => undefined);
      },
      { max: 3, timeout: 50, name: 'slow query' },
    );
    const settled = result.then(
      () => undefined,
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(50);
    expect(await settled).toMatchObject({ name: 'TimeoutError', message: 'slow query timed out' });
    expect(calls).toBe(1);
  });

  it('reports progress', async () => {
    const messages: string[] = [];
    const { result } = run(
      {
        max: 2,
        match: [/boom/],
        backoffBase: 0,
        name: 'q',
        report: (message) => messages.push(message),
      },
      new Error('boom'),
      1,
    );
    await result;
    expect(messages).toEqual(['Trying q #1', 'Error: boom', 'Trying q #2']);
  });
});

describe('connection error names (matchable by v6 names)', () => {
  const mapper = new PgErrorMapper();
  const mapped = (code: string): Error =>
    mapper.mapConnectionError(Object.assign(new Error('x'), { code }));

  it('uses the Sequelize v6 name for every connection error class', () => {
    expect(new ConnectionError(new Error('x')).name).toBe('SequelizeConnectionError');
    expect(mapped('ECONNREFUSED')).toBeInstanceOf(ConnectionRefusedError);
    expect(mapped('ECONNREFUSED').name).toBe('SequelizeConnectionRefusedError');
    expect(mapped('ENOTFOUND')).toBeInstanceOf(HostNotFoundError);
    expect(mapped('ENOTFOUND').name).toBe('SequelizeHostNotFoundError');
    expect(mapped('EHOSTUNREACH')).toBeInstanceOf(HostNotReachableError);
    expect(mapped('EHOSTUNREACH').name).toBe('SequelizeHostNotReachableError');
    expect(mapped('EINVAL')).toBeInstanceOf(InvalidConnectionError);
    expect(mapped('EINVAL').name).toBe('SequelizeInvalidConnectionError');
    expect(mapped('ETIMEDOUT')).toBeInstanceOf(ConnectionTimedOutError);
    expect(mapped('ETIMEDOUT').name).toBe('SequelizeConnectionTimedOutError');
    expect(new ConnectionAcquireTimeoutError(new Error('x')).name).toBe(
      'SequelizeConnectionAcquireTimeoutError',
    );
  });

  it('puts the v6 name in toString(), which regular-expression matches compare', () => {
    expect(String(mapped('ECONNREFUSED'))).toMatch(/^SequelizeConnectionRefusedError: /);
  });
});
