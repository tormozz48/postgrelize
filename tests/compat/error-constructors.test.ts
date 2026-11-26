import { describe, expect, it } from 'vitest';
import { libraries, type Lib } from '../support/compat.ts';

type Loose = new (...args: unknown[]) => Error & Record<string, unknown>;

const describeErrors = (lib: Lib): unknown => {
  const errors = lib as unknown as Record<string, Loose>;
  const make = (name: string, ...args: unknown[]): Error & Record<string, unknown> =>
    new (errors[name] as Loose)(...args);
  const empty = [
    'ConnectionError',
    'ConnectionRefusedError',
    'ConnectionTimedOutError',
    'AccessDeniedError',
    'HostNotFoundError',
    'HostNotReachableError',
    'InvalidConnectionError',
  ].map((name) => {
    const error = make(name, null);
    return [error.name, error.message, error.stack?.split('\n')[0]];
  });
  const bare = [
    'UniqueConstraintError',
    'ForeignKeyConstraintError',
    'ExclusionConstraintError',
  ].map((name) => make(name).name);
  const parent = Object.assign(new Error('x'), { sql: 'SELECT 1', parameters: [1] });
  const database = make('DatabaseError', parent);
  const nested = make('AggregateError', [
    new Error('foo'),
    new Error('bar\nbaz'),
    make('AggregateError', [new Error('qux')]),
  ]);
  return [empty, bare, database['sql'], database['parameters'], String(nested)];
};

describe('compat: error constructors', () => {
  it('accept the arguments v6 accepts', () => {
    expect(describeErrors(libraries.postgrelize)).toEqual(describeErrors(libraries.sequelize));
  });
});
