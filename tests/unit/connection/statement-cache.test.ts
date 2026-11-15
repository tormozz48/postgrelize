import { describe, expect, it, vi } from 'vitest';
import { StatementCache, type StatementClient } from '../../../src/connection/statement-cache.ts';

const result = { rows: [], rowCount: 0, command: 'SELECT' };
const clientOf = (query = vi.fn<StatementClient['query']>().mockResolvedValue(result)) => ({
  query,
});
const sql = (text: string) => ({ text, values: [1] });

describe('StatementCache', () => {
  it('names eligible statements by a hash of the text', async () => {
    const client = clientOf();
    const cache = new StatementCache(true);
    await cache.run(client, sql('SELECT $1'), true);
    await cache.run(client, sql('SELECT $1'), true);
    const [first, second] = client.query.mock.calls.map(([config]) => config.name);
    expect(first).toMatch(/^pgz_[0-9a-f]{16}$/);
    expect(second).toBe(first);
  });

  it('leaves multi-statement, DDL, long and over-limit texts unnamed', async () => {
    const client = clientOf();
    const cache = new StatementCache({ max: 1 });
    await cache.run(client, sql('SELECT 1; SELECT 2'), true);
    await cache.run(client, sql('CREATE TABLE a (id int)'), true);
    await cache.run(client, sql(`SELECT '${'x'.repeat(9000)}'`), true);
    await cache.run(client, sql('SELECT 1'), true);
    await cache.run(client, sql('SELECT 2'), true);
    expect(client.query.mock.calls.map(([config]) => config.name !== undefined)).toEqual([
      false,
      false,
      false,
      true,
      false,
    ]);
  });

  it('keeps separate entries per client', async () => {
    const cache = new StatementCache({ max: 1 });
    const a = clientOf();
    const b = clientOf();
    await cache.run(a, sql('SELECT 1'), true);
    await cache.run(b, sql('SELECT 2'), true);
    expect(b.query.mock.calls[0]?.[0].name).toBeDefined();
  });

  it('retries a stale plan unnamed and stops naming that text', async () => {
    const stale = new Error('cached plan must not change result type');
    const query = vi
      .fn<StatementClient['query']>()
      .mockRejectedValueOnce(stale)
      .mockResolvedValue(result);
    const client = clientOf(query);
    const cache = new StatementCache(true);
    await cache.run(client, sql('SELECT 1'), true);
    await cache.run(client, sql('SELECT 1'), true);
    expect(query.mock.calls.map(([config]) => config.name !== undefined)).toEqual([
      true,
      false,
      false,
    ]);
  });

  it('rethrows a stale plan when not retryable and other errors always', async () => {
    const stale = new Error('cached plan must not change result type');
    const cache = new StatementCache(true);
    await expect(
      cache.run(
        clientOf(vi.fn<StatementClient['query']>().mockRejectedValue(stale)),
        sql('SELECT 1'),
        false,
      ),
    ).rejects.toBe(stale);
    const other = new Error('boom');
    await expect(
      cache.run(
        clientOf(vi.fn<StatementClient['query']>().mockRejectedValue(other)),
        sql('SELECT 1'),
        true,
      ),
    ).rejects.toBe(other);
  });

  it('rejects an invalid max', () => {
    expect(() => new StatementCache({ max: 0 })).toThrow('positive integer');
    expect(() => new StatementCache({ max: 1.5 })).toThrow('positive integer');
  });
});
