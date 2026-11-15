import { describe, expect, it, vi } from 'vitest';
import { ConnectionConfig } from '../../../src/connection/connection-config.ts';
import { QueryLogger } from '../../../src/connection/query-logger.ts';

describe('ConnectionConfig', () => {
  it('parses postgres URIs including credentials, port, database and sslmode', () => {
    const config = new ConnectionConfig([
      'postgresql://us%40er:p%3Ass@db.example:6543/my%20db?sslmode=require',
    ]);
    expect(config.settings()).toEqual({
      database: 'my db',
      username: 'us@er',
      password: 'p:ss',
      host: 'db.example',
      port: 6543,
    });
    expect(config.replicationPoolConfigs().write.ssl).toBe(true);
  });

  it('applies defaults for URIs without port, database, credentials and for sslmode=disable', () => {
    const config = new ConnectionConfig(['postgres://localhost?sslmode=disable']);
    expect(config.settings()).toEqual({
      database: undefined,
      username: undefined,
      password: undefined,
      host: 'localhost',
      port: 5432,
    });
    expect(config.replicationPoolConfigs().write.ssl).toBeUndefined();
  });

  it('merges URI options with the second argument and lets the URI win', () => {
    const config = new ConnectionConfig([
      'postgres://u@h:1/d',
      { port: 2, pool: { max: 9 }, timezone: 'Europe/Paris' },
    ]);
    expect(config.settings().port).toBe(1);
    const write = config.replicationPoolConfigs().write;
    expect(write.max).toBe(9);
    expect(write.options).toBe('-c TimeZone=Europe/Paris');
  });

  it('accepts database, username and password as separate arguments', () => {
    const config = new ConnectionConfig(['db', 'user', 'secret', { host: 'h', port: 7 }]);
    expect(config.settings()).toEqual({
      database: 'db',
      username: 'user',
      password: 'secret',
      host: 'h',
      port: 7,
    });
    const options = new ConnectionConfig(['db', { host: 'h2' }]);
    expect(options.settings()).toMatchObject({ database: 'db', host: 'h2' });
    const nulls = new ConnectionConfig(['db', null, null]);
    expect(nulls.settings()).toMatchObject({ database: 'db', username: undefined });
  });

  it('works without arguments and with an options object', () => {
    expect(new ConnectionConfig([]).settings().host).toBe('localhost');
    expect(new ConnectionConfig([{ database: 'x' }]).settings().database).toBe('x');
  });

  it('rejects non-postgres URIs and dialects', () => {
    expect(() => new ConnectionConfig(['mysql://h/d'])).toThrow(
      'postgrelize supports only postgres:// connection URIs, got mysql:',
    );
    expect(() => new ConnectionConfig([{ dialect: 'mysql' as never }])).toThrow(
      'postgrelize supports only the postgres dialect, got mysql',
    );
    expect(new ConnectionConfig([{ dialect: 'postgres' }]).options.dialect).toBe('postgres');
  });

  it('rejects timezones that could smuggle libpq options', () => {
    expect(() =>
      new ConnectionConfig([{ timezone: 'UTC -c x=y' }]).replicationPoolConfigs(),
    ).toThrow('Invalid timezone: UTC -c x=y');
  });

  it('derives pool limits, dialect options and the TimeZone startup option', () => {
    const { write, read } = new ConnectionConfig([
      {
        host: 'h',
        pool: { max: 3, idle: 5, acquire: 7, maxUses: 11 },
        dialectOptions: { options: '-c search_path=s', statement_timeout: 50 },
      },
    ]).replicationPoolConfigs();
    expect(read).toEqual([]);
    expect(write).toMatchObject({
      host: 'h',
      max: 3,
      idleTimeoutMillis: 5,
      connectionTimeoutMillis: 7,
      maxUses: 11,
      statement_timeout: 50,
      options: '-c TimeZone=+00:00 -c search_path=s',
    });
    expect(new ConnectionConfig([{}]).replicationPoolConfigs().write).toMatchObject({
      max: 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 60_000,
    });
  });

  it('derives writer and reader configurations from replication, member values overriding', () => {
    const { write, read } = new ConnectionConfig([
      {
        database: 'd',
        username: 'u',
        host: 'default',
        replication: {
          write: { host: 'primary', port: 1 },
          read: [
            { host: 'r1', password: 'x' },
            { host: 'r2', port: undefined },
          ],
        },
      },
    ]).replicationPoolConfigs();
    expect(write).toMatchObject({ host: 'primary', port: 1, database: 'd', user: 'u' });
    expect(read.map((config) => [config.host, config.port, config.password])).toEqual([
      ['r1', 5432, 'x'],
      ['r2', 5432, undefined],
    ]);
  });

  it('accepts a single reader and a missing write member', () => {
    const { write, read } = new ConnectionConfig([
      { host: 'h', replication: { read: { host: 'only' } } as never },
    ]).replicationPoolConfigs();
    expect(write.host).toBe('h');
    expect(read.map((config) => config.host)).toEqual(['only']);
  });
});

describe('QueryLogger', () => {
  const query = { text: 'SELECT $1', values: [1] };

  it('logs the SQL with its bind values and the transaction id', () => {
    const logging = vi.fn<(...args: unknown[]) => unknown>();
    new QueryLogger({ logging }).log(query, { transactionId: 'tx1' }, 5);
    expect(logging).toHaveBeenCalledWith('Executing (tx1): SELECT $1', { bind: [1] });
    new QueryLogger({ logging }).log(query, {}, 5);
    expect(logging).toHaveBeenLastCalledWith('Executing (default): SELECT $1', { bind: [1] });
  });

  it('reports the elapsed time in benchmark mode, from defaults or per query', () => {
    const logging = vi.fn<(...args: unknown[]) => unknown>();
    new QueryLogger({ logging, benchmark: true }).log(query, {}, 12);
    expect(logging).toHaveBeenCalledWith('Executed (default): SELECT $1', 12);
    new QueryLogger({ logging }).log(query, { benchmark: true }, 3);
    expect(logging).toHaveBeenLastCalledWith('Executed (default): SELECT $1', 3);
    new QueryLogger({ logging, benchmark: true }).log(query, { benchmark: false }, 3);
    expect(logging).toHaveBeenLastCalledWith('Executing (default): SELECT $1', { bind: [1] });
  });

  it('stays silent when logging is disabled or per-query logging overrides it', () => {
    const logging = vi.fn<(...args: unknown[]) => unknown>();
    new QueryLogger({ logging }).log(query, { logging: false }, 1);
    new QueryLogger({}).log(query, {}, 1);
    new QueryLogger({ logging: false }).log(query, {}, 1);
    expect(logging).not.toHaveBeenCalled();
    const override = vi.fn<(...args: unknown[]) => unknown>();
    new QueryLogger({ logging: false }).log(query, { logging: override }, 1);
    expect(override).toHaveBeenCalledTimes(1);
  });
});
