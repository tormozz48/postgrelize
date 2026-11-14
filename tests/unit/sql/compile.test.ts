import { describe, expect, it } from 'vitest';
import { and, binary, ident, or, param, raw } from '../../../src/sql/ast.ts';
import { compile, compileExpr, quoteIdent } from '../../../src/sql/compile.ts';

const users = { name: 'users' } as const;

describe('quoteIdent', () => {
  it('wraps in double quotes and escapes embedded quotes', () => {
    expect(quoteIdent('a"b')).toBe('"a""b"');
  });
});

describe('compileExpr', () => {
  it('numbers params in order', () => {
    expect(
      compileExpr(
        and([binary('=', ident('a'), param(1)), binary('>', ident('t', 'b'), param('x'))]),
      ),
    ).toEqual({ text: '("a" = $1 AND "t"."b" > $2)', values: [1, 'x'] });
  });

  it('renders empty and/or as constants', () => {
    expect(compileExpr(and([])).text).toBe('TRUE');
    expect(compileExpr(or([])).text).toBe('FALSE');
  });

  it('renders between, list, cast, fn, excluded, postfix, prefix, alias', () => {
    expect(
      compileExpr({
        kind: 'between',
        expr: ident('n'),
        low: param(1),
        high: param(2),
        negated: true,
      }).text,
    ).toBe('"n" NOT BETWEEN $1 AND $2');
    expect(compileExpr({ kind: 'list', items: [param(1), param(2)] }).text).toBe('($1, $2)');
    expect(compileExpr({ kind: 'cast', expr: param('1'), type: 'integer' }).text).toBe(
      'CAST($1 AS integer)',
    );
    expect(
      compileExpr({ kind: 'fn', name: 'count', args: [ident('id')], distinct: true }).text,
    ).toBe('count(DISTINCT "id")');
    expect(compileExpr({ kind: 'excluded', column: 'v' }).text).toBe('EXCLUDED."v"');
    expect(compileExpr({ kind: 'postfix', op: 'IS NULL', expr: ident('a') }).text).toBe(
      '"a" IS NULL',
    );
    expect(compileExpr({ kind: 'prefix', op: 'NOT', expr: ident('a') }).text).toBe('NOT "a"');
    expect(compileExpr({ kind: 'alias', expr: raw('1'), alias: 'one' }).text).toBe('1 AS "one"');
  });
});

describe('compile select', () => {
  it('renders all clauses', () => {
    expect(
      compile({
        kind: 'select',
        distinct: true,
        columns: [{ kind: 'star', table: 'u' }],
        from: { name: 'users', schema: 'app', alias: 'u' },
        joins: [
          {
            type: 'LEFT OUTER',
            table: { name: 'posts', alias: 'p' },
            on: binary('=', ident('p', 'userId'), ident('u', 'id')),
          },
        ],
        where: binary('=', ident('u', 'active'), param(true)),
        groupBy: [ident('u', 'id')],
        having: binary('>', raw('count(*)'), param(1)),
        orderBy: [{ expr: ident('u', 'id'), direction: 'DESC', nulls: 'LAST' }],
        limit: 10,
        offset: 20,
        lock: { strength: 'UPDATE', of: ['u'], wait: 'NOWAIT' },
      }),
    ).toEqual({
      text:
        'SELECT DISTINCT "u".* FROM "app"."users" AS "u" LEFT OUTER JOIN "posts" AS "p" ON "p"."userId" = "u"."id"' +
        ' WHERE "u"."active" = $1 GROUP BY "u"."id" HAVING count(*) > $2' +
        ' ORDER BY "u"."id" DESC NULLS LAST LIMIT $3 OFFSET $4 FOR UPDATE OF "u" NOWAIT',
      values: [true, 1, 10, 20],
    });
  });

  it('selects from a subquery', () => {
    expect(
      compile({
        kind: 'select',
        columns: [raw('count(*)')],
        from: {
          subquery: { kind: 'select', columns: [ident('id')], from: users, limit: 5 },
          alias: 'sub',
        },
      }),
    ).toEqual({
      text: 'SELECT count(*) FROM (SELECT "id" FROM "users" LIMIT $1) AS "sub"',
      values: [5],
    });
  });
});

describe('compile insert', () => {
  it('renders multi-row values with returning', () => {
    expect(
      compile({
        kind: 'insert',
        table: users,
        columns: ['a', 'b'],
        rows: [
          [param(1), param(2)],
          [param(3), raw('DEFAULT')],
        ],
        returning: [{ kind: 'star' }],
      }),
    ).toEqual({
      text: 'INSERT INTO "users" ("a", "b") VALUES ($1, $2), ($3, DEFAULT) RETURNING *',
      values: [1, 2, 3],
    });
  });

  it('renders DEFAULT VALUES', () => {
    expect(compile({ kind: 'insert', table: users, columns: [], rows: [[]] }).text).toBe(
      'INSERT INTO "users" DEFAULT VALUES',
    );
  });

  it('renders ON CONFLICT with partial index target and DO UPDATE WHERE', () => {
    expect(
      compile({
        kind: 'insert',
        table: { name: 'users', alias: 'User' },
        columns: ['email', 'v'],
        rows: [[param('e'), param(2)]],
        onConflict: {
          target: {
            kind: 'columns',
            items: [ident('email')],
            where: { kind: 'postfix', op: 'IS NULL', expr: ident('deletedAt') },
          },
          action: {
            kind: 'update',
            set: [{ column: 'v', value: { kind: 'excluded', column: 'v' } }],
            where: binary('<', ident('User', 'v'), { kind: 'excluded', column: 'v' }),
          },
        },
      }).text,
    ).toBe(
      'INSERT INTO "users" AS "User" ("email", "v") VALUES ($1, $2)' +
        ' ON CONFLICT ("email") WHERE "deletedAt" IS NULL' +
        ' DO UPDATE SET "v" = EXCLUDED."v" WHERE "User"."v" < EXCLUDED."v"',
    );
  });

  it('renders ON CONSTRAINT and DO NOTHING', () => {
    expect(
      compile({
        kind: 'insert',
        table: users,
        columns: ['a'],
        rows: [[param(1)]],
        onConflict: {
          target: { kind: 'constraint', name: 'users_a_key' },
          action: { kind: 'nothing' },
        },
      }).text,
    ).toBe(
      'INSERT INTO "users" ("a") VALUES ($1) ON CONFLICT ON CONSTRAINT "users_a_key" DO NOTHING',
    );
  });
});

describe('compile update/delete/truncate', () => {
  it('renders update', () => {
    expect(
      compile({
        kind: 'update',
        table: users,
        set: [{ column: 'a', value: param(1) }],
        where: binary('=', ident('id'), param(2)),
        returning: [{ kind: 'star' }],
      }),
    ).toEqual({ text: 'UPDATE "users" SET "a" = $1 WHERE "id" = $2 RETURNING *', values: [1, 2] });
  });

  it('renders delete', () => {
    expect(
      compile({ kind: 'delete', table: users, where: binary('=', ident('id'), param(1)) }).text,
    ).toBe('DELETE FROM "users" WHERE "id" = $1');
  });

  it('renders truncate', () => {
    expect(
      compile({ kind: 'truncate', table: users, cascade: true, restartIdentity: true }).text,
    ).toBe('TRUNCATE "users" RESTART IDENTITY CASCADE');
  });
});
