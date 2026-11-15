import { describe, expect, it } from 'vitest';
import {
  AccessDeniedError,
  ConnectionError,
  ConnectionRefusedError,
  DatabaseError,
  ForeignKeyConstraintError,
  TimeoutError,
  UniqueConstraintError,
  ValidationError,
} from '../../../src/errors/errors.ts';
import { PgErrorMapper } from '../../../src/errors/map-pg-error.ts';

const mapper = new PgErrorMapper();

const pgError = (code: string, extra: Record<string, string> = {}) =>
  Object.assign(new Error('boom'), { code, ...extra });

describe('parseKeyDetail', () => {
  it('parses composite keys', () => {
    expect(mapper.parseKeyDetail('Key (a, "b")=(1, x) already exists.')).toEqual({
      a: '1',
      b: 'x',
    });
    expect(mapper.parseKeyDetail(undefined)).toBeUndefined();
  });
});

describe('mapQueryError', () => {
  it('maps unique violations with fields and items', () => {
    const error = mapper.mapQueryError(
      pgError('23505', { detail: 'Key (email)=(a@b.c) already exists.' }),
      {
        sql: 'INSERT',
      },
    );
    expect(error).toBeInstanceOf(UniqueConstraintError);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.name).toBe('SequelizeUniqueConstraintError');
    expect(error.message).toBe('Validation error');
    const unique = error as UniqueConstraintError;
    expect(unique.fields).toEqual({ email: 'a@b.c' });
    expect(unique.errors[0]).toMatchObject({
      path: 'email',
      type: 'unique violation',
      origin: 'DB',
    });
    expect(unique.sql).toBe('INSERT');
  });

  it('maps foreign key, timeout and generic errors', () => {
    const fk = mapper.mapQueryError(
      pgError('23503', { detail: 'Key (userId)=(9) is not present', table: 'posts' }),
    );
    expect(fk).toBeInstanceOf(ForeignKeyConstraintError);
    expect((fk as ForeignKeyConstraintError).fields).toEqual(['userId']);
    expect(mapper.mapQueryError(pgError('57014'))).toBeInstanceOf(TimeoutError);
    const generic = mapper.mapQueryError(pgError('42P01'), { sql: 'SELECT', parameters: [1] });
    expect(generic).toBeInstanceOf(DatabaseError);
    expect(generic).toMatchObject({
      name: 'SequelizeDatabaseError',
      sql: 'SELECT',
      parameters: [1],
    });
  });

  it('maps connection failures', () => {
    expect(mapper.mapQueryError(pgError('ECONNREFUSED'))).toBeInstanceOf(ConnectionRefusedError);
    expect(mapper.mapConnectionError(pgError('28P01'))).toBeInstanceOf(AccessDeniedError);
    expect(mapper.mapConnectionError(new Error('x'))).toBeInstanceOf(ConnectionError);
    expect(mapper.mapConnectionError(pgError('28P01')).name).toBe('SequelizeAccessDeniedError');
  });
});
