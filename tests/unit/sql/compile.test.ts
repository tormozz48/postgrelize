import { describe, expect, it } from 'vitest';
import { SqlAst, type ExprNode, type StatementNode } from '../../../src/sql/ast.ts';
import { SqlCompiler } from '../../../src/sql/compile.ts';

const ast = new SqlAst();
const compiler = new SqlCompiler();
const compile = (node: StatementNode) => compiler.compile(node);
const compileExpr = (node: ExprNode) => compiler.compileExpr(node);

const users = { name: 'users' } as const;

describe('quoteIdent', () => {
  it('wraps in double quotes and escapes embedded quotes', () => {
    expect(SqlCompiler.quoteIdent('a"b')).toBe('"a""b"');
  });
});

describe('compileExpr', () => {
  it('numbers params in order', () => {
    expect(
      compileExpr(
        ast.and([
          ast.binary('=', ast.ident('a'), ast.param(1)),
          ast.binary('>', ast.ident('t', 'b'), ast.param('x')),
        ]),
      ),
    ).toEqual({ text: '("a" = $1 AND "t"."b" > $2)', values: [1, 'x'] });
  });

  it('renders empty and/or as constants', () => {
    expect(compileExpr(ast.and([])).text).toBe('TRUE');
    expect(compileExpr(ast.or([])).text).toBe('FALSE');
  });

  it('renders between, list, cast, fn, excluded, postfix, prefix, alias', () => {
    expect(
      compileExpr({
        kind: 'between',
        expr: ast.ident('n'),
        low: ast.param(1),
        high: ast.param(2),
        negated: true,
      }).text,
    ).toBe('"n" NOT BETWEEN $1 AND $2');
    expect(compileExpr({ kind: 'list', items: [ast.param(1), ast.param(2)] }).text).toBe(
      '($1, $2)',
    );
    expect(compileExpr({ kind: 'cast', expr: ast.param('1'), type: 'integer' }).text).toBe(
      'CAST($1 AS integer)',
    );
    expect(
      compileExpr({ kind: 'fn', name: 'count', args: [ast.ident('id')], distinct: true }).text,
    ).toBe('count(DISTINCT "id")');
    expect(compileExpr({ kind: 'excluded', column: 'v' }).text).toBe('EXCLUDED."v"');
    expect(compileExpr({ kind: 'postfix', op: 'IS NULL', expr: ast.ident('a') }).text).toBe(
      '"a" IS NULL',
    );
    expect(compileExpr({ kind: 'prefix', op: 'NOT', expr: ast.ident('a') }).text).toBe('NOT "a"');
    expect(compileExpr({ kind: 'alias', expr: ast.raw('1'), alias: 'one' }).text).toBe(
      '1 AS "one"',
    );
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
            on: ast.binary('=', ast.ident('p', 'userId'), ast.ident('u', 'id')),
          },
        ],
        where: ast.binary('=', ast.ident('u', 'active'), ast.param(true)),
        groupBy: [ast.ident('u', 'id')],
        having: ast.binary('>', ast.raw('count(*)'), ast.param(1)),
        orderBy: [{ expr: ast.ident('u', 'id'), direction: 'DESC', nulls: 'LAST' }],
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

  it('renders DISTINCT ON and window functions', () => {
    expect(
      compile({
        kind: 'select',
        distinctOn: [ast.ident('u')],
        columns: [
          {
            kind: 'over',
            expr: ast.raw('row_number()'),
            partitionBy: [ast.ident('u')],
            orderBy: [{ expr: ast.ident('r'), direction: 'DESC' }],
          },
        ],
        from: users,
      }).text,
    ).toBe(
      'SELECT DISTINCT ON ("u") row_number() OVER (PARTITION BY "u" ORDER BY "r" DESC) FROM "users"',
    );
  });

  it('renders recursive CTEs and extra FROM relations', () => {
    const base = { kind: 'select' as const, columns: [ast.ident('id')], from: users };
    expect(
      compile({
        kind: 'select',
        with: {
          recursive: true,
          ctes: [
            {
              name: 'tree',
              materialized: false,
              query: {
                kind: 'union',
                all: true,
                left: { ...base, where: ast.binary('=', ast.ident('id'), ast.param(1)) },
                right: {
                  ...base,
                  extraFrom: [{ name: 'tree' }],
                  where: ast.binary('=', ast.ident('users', 'parent'), ast.ident('tree', 'id')),
                },
              },
            },
          ],
        },
        columns: [{ kind: 'star' }],
        from: { name: 'tree', alias: 'User' },
      }),
    ).toEqual({
      text: 'WITH RECURSIVE "tree" AS NOT MATERIALIZED (SELECT "id" FROM "users" WHERE "id" = $1 UNION ALL SELECT "id" FROM "users", "tree" WHERE "users"."parent" = "tree"."id") SELECT * FROM "tree" AS "User"',
      values: [1],
    });
  });

  it('selects from a subquery', () => {
    expect(
      compile({
        kind: 'select',
        columns: [ast.raw('count(*)')],
        from: {
          subquery: { kind: 'select', columns: [ast.ident('id')], from: users, limit: 5 },
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
          [ast.param(1), ast.param(2)],
          [ast.param(3), ast.raw('DEFAULT')],
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
        rows: [[ast.param('e'), ast.param(2)]],
        onConflict: {
          target: {
            kind: 'columns',
            items: [ast.ident('email')],
            where: { kind: 'postfix', op: 'IS NULL', expr: ast.ident('deletedAt') },
          },
          action: {
            kind: 'update',
            set: [{ column: 'v', value: { kind: 'excluded', column: 'v' } }],
            where: ast.binary('<', ast.ident('User', 'v'), { kind: 'excluded', column: 'v' }),
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
        rows: [[ast.param(1)]],
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
        set: [{ column: 'a', value: ast.param(1) }],
        where: ast.binary('=', ast.ident('id'), ast.param(2)),
        returning: [{ kind: 'star' }],
      }),
    ).toEqual({ text: 'UPDATE "users" SET "a" = $1 WHERE "id" = $2 RETURNING *', values: [1, 2] });
  });

  it('renders delete', () => {
    expect(
      compile({
        kind: 'delete',
        table: users,
        where: ast.binary('=', ast.ident('id'), ast.param(1)),
      }).text,
    ).toBe('DELETE FROM "users" WHERE "id" = $1');
  });

  it('renders truncate', () => {
    expect(
      compile({ kind: 'truncate', table: users, cascade: true, restartIdentity: true }).text,
    ).toBe('TRUNCATE "users" RESTART IDENTITY CASCADE');
  });
});
