import { describe, expect, it, vi } from 'vitest';
import { StatementTimeout } from '../../../src/connection/statement-timeout.ts';

const clientOf = () => ({
  query: vi
    .fn<(config: { text: string; values?: unknown[] }) => Promise<unknown>>()
    .mockResolvedValue({
      rows: [{ value: '5s' }],
    }),
});

describe('StatementTimeout', () => {
  it('wraps a standalone query in BEGIN / COMMIT and rolls back on failure', async () => {
    const ok = clientOf();
    await new StatementTimeout().run(ok as never, false, 100, () => Promise.resolve(1));
    expect(ok.query.mock.calls.map(([config]) => config.text)).toEqual([
      'BEGIN',
      'SELECT set_config($1, $2, true)',
      'COMMIT',
    ]);
    const failing = clientOf();
    await expect(
      new StatementTimeout().run(failing as never, false, 100, () =>
        Promise.reject(new Error('x')),
      ),
    ).rejects.toThrow('x');
    expect(failing.query.mock.calls.at(-1)?.[0].text).toBe('ROLLBACK');
  });

  it('restores the previous value inside a transaction, even after a failure', async () => {
    const client = clientOf();
    await expect(
      new StatementTimeout().run(client as never, true, 100, () => Promise.reject(new Error('x'))),
    ).rejects.toThrow('x');
    expect(client.query.mock.calls.at(-1)?.[0].values).toEqual(['statement_timeout', '5s']);
  });

  it('rejects invalid values', async () => {
    for (const value of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(
        new StatementTimeout().run(clientOf() as never, false, value, () => Promise.resolve(1)),
      ).rejects.toThrow(/non-negative integer/);
    }
  });
});
