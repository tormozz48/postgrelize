import { describe, expect, it } from 'vitest';
import {
  AssociationError,
  BaseError,
  ConnectionError,
  DatabaseError,
  ExclusionConstraintError,
  ForeignKeyConstraintError,
  HostNotFoundError,
  InvalidConnectionError,
  OptimisticLockError,
  UniqueConstraintError,
} from '../../../src/errors/errors.ts';
import { PgErrorMapper } from '../../../src/errors/map-pg-error.ts';

const mapper = new PgErrorMapper();

const pgError = (code: string, extra: Record<string, string> = {}) =>
  Object.assign(new Error('boom'), { code, ...extra });

describe('constraint error classes', () => {
  it('builds an exclusion constraint error from the driver error', () => {
    const parent = pgError('23P01');
    const error = new ExclusionConstraintError({
      parent,
      fields: { room: '1' },
      table: 'bookings',
      constraint: 'no_overlap',
      sql: 'INSERT',
    });
    expect(error).toBeInstanceOf(DatabaseError);
    expect(error).toMatchObject({
      name: 'SequelizeExclusionConstraintError',
      fields: { room: '1' },
      table: 'bookings',
      constraint: 'no_overlap',
      sql: 'INSERT',
      message: 'boom',
    });
    expect(error.parent).toBe(parent);
  });

  it('leaves exclusion fields undefined when omitted and keeps array fields', () => {
    const parent = pgError('23P01');
    expect(new ExclusionConstraintError({ parent }).fields).toBeUndefined();
    expect(new ExclusionConstraintError({ parent, fields: ['a', 'b'] }).fields).toEqual(['a', 'b']);
  });

  it('builds a foreign key error from object, array or missing fields', () => {
    const parent = pgError('23503');
    expect(new ForeignKeyConstraintError({ parent, fields: { userId: '9' } }).fields).toEqual({
      userId: '9',
    });
    expect(new ForeignKeyConstraintError({ fields: { assetAccountId: '9' } }).fields).toEqual({
      assetAccountId: '9',
    });
    expect(new ForeignKeyConstraintError({ parent, fields: ['userId'] }).fields).toEqual([
      'userId',
    ]);
    const bare = new ForeignKeyConstraintError({ parent, constraint: 'fk', table: 't' });
    expect(bare).toMatchObject({ index: 'fk', table: 't' });
    expect(bare.fields).toBeUndefined();
  });
});

describe('misc error classes', () => {
  it('builds an association error', () => {
    const error = new AssociationError('bad association');
    expect(error).toBeInstanceOf(BaseError);
    expect(error.name).toBe('SequelizeAssociationError');
    expect(error.message).toBe('bad association');
  });

  it('builds an optimistic lock error with default and custom messages', () => {
    expect(new OptimisticLockError({ modelName: 'User' }).message).toBe(
      'Attempting to update a stale model instance: User',
    );
    expect(new OptimisticLockError().message).toBe('Attempting to update a stale model instance: ');
    expect(new OptimisticLockError({ message: 'custom' }).message).toBe('custom');
  });
});

describe('PgErrorMapper edge cases', () => {
  it('maps exclusion violations with table, constraint and parsed fields', () => {
    const error = mapper.mapQueryError(
      pgError('23P01', {
        detail: 'Key (room)=(1) conflicts with existing key (room)=(1).',
        table: 'bookings',
        constraint: 'no_overlap',
      }),
      { sql: 'INSERT' },
    );
    expect(error).toBeInstanceOf(ExclusionConstraintError);
    expect(error).toMatchObject({ table: 'bookings', constraint: 'no_overlap', sql: 'INSERT' });
  });

  it('maps unique violations without a parsable detail using the driver message', () => {
    const error = mapper.mapQueryError(pgError('23505', { table: 't', constraint: 'c' }));
    expect(error).toBeInstanceOf(UniqueConstraintError);
    expect(error.message).toBe('boom');
    expect((error as UniqueConstraintError).errors).toEqual([]);
  });

  it('returns errors that already are Sequelize errors unchanged', () => {
    const existing = new AssociationError('x');
    expect(mapper.mapQueryError(existing)).toBe(existing);
  });

  it('wraps non-Error values thrown by the driver', () => {
    const error = mapper.mapQueryError('plain string failure');
    expect(error).toBeInstanceOf(DatabaseError);
    expect(error.message).toBe('plain string failure');
    expect(mapper.mapConnectionError('offline')).toBeInstanceOf(ConnectionError);
    expect(mapper.mapConnectionError('offline').message).toBe('offline');
  });

  it('maps host and class 08 failures raised by queries', () => {
    expect(mapper.mapQueryError(pgError('ENOTFOUND'))).toBeInstanceOf(HostNotFoundError);
    expect(mapper.mapQueryError(pgError('EAI_AGAIN'))).toBeInstanceOf(HostNotFoundError);
    expect(mapper.mapQueryError(pgError('EINVAL'))).toBeInstanceOf(InvalidConnectionError);
    const lost = mapper.mapQueryError(pgError('08006'));
    expect(lost).toBeInstanceOf(ConnectionError);
    expect(lost).not.toBeInstanceOf(DatabaseError);
  });

  it('returns existing connection errors unchanged', () => {
    const existing = new ConnectionError(new Error('x'));
    expect(mapper.mapConnectionError(existing)).toBe(existing);
  });
});
