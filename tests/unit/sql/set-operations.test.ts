import { describe, expect, it } from 'vitest';
import { SqlAst, type QueryNode, type SelectNode } from '../../../src/sql/ast.ts';
import { SqlCompiler } from '../../../src/sql/compile.ts';

const ast = new SqlAst();
const compiler = new SqlCompiler();

const select = (table: string, extra: Partial<SelectNode> = {}): SelectNode => ({
  kind: 'select',
  columns: [ast.ident('id')],
  from: { name: table },
  ...extra,
});

const setop = (
  op: 'UNION' | 'INTERSECT' | 'EXCEPT',
  left: QueryNode,
  right: QueryNode,
  all = false,
): QueryNode => ({ kind: 'setop', op, all, left, right });

const byId = (value: number): Partial<SelectNode> => ({
  where: ast.binary('=', ast.ident('id'), ast.param(value)),
});

const sql = (node: QueryNode): string => compiler.compile(node).text;

describe('set operations', () => {
  it('renders every operator with and without ALL', () => {
    const a = select('a');
    const b = select('b');
    expect(sql(setop('UNION', a, b))).toBe('SELECT "id" FROM "a" UNION SELECT "id" FROM "b"');
    expect(sql(setop('UNION', a, b, true))).toContain(' UNION ALL ');
    expect(sql(setop('INTERSECT', a, b))).toContain(' INTERSECT ');
    expect(sql(setop('INTERSECT', a, b, true))).toContain(' INTERSECT ALL ');
    expect(sql(setop('EXCEPT', a, b))).toContain(' EXCEPT ');
    expect(sql(setop('EXCEPT', a, b, true))).toContain(' EXCEPT ALL ');
  });

  it('parenthesizes nested set operations and operands with ORDER BY or LIMIT', () => {
    const limited = select('a', { limit: 1, orderBy: [{ expr: ast.ident('id') }] });
    expect(sql(setop('EXCEPT', setop('UNION', select('a'), select('b')), limited))).toBe(
      '(SELECT "id" FROM "a" UNION SELECT "id" FROM "b") EXCEPT (SELECT "id" FROM "a" ORDER BY "id" LIMIT $1)',
    );
  });

  it('numbers parameters across operands', () => {
    const compiled = compiler.compile(setop('UNION', select('a', byId(1)), select('b', byId(2))));
    expect(compiled.values).toEqual([1, 2]);
    expect(compiled.text).toContain('"id" = $1 UNION SELECT "id" FROM "b" WHERE "id" = $2');
  });

  it('compiles a set operation as a FROM source and as a CTE body', () => {
    const union = setop('UNION', select('a'), select('b'));
    expect(sql(select('x', { from: { subquery: union, alias: 'u' } }))).toBe(
      'SELECT "id" FROM (SELECT "id" FROM "a" UNION SELECT "id" FROM "b") AS "u"',
    );
    expect(
      sql(select('x', { with: { recursive: false, ctes: [{ name: 'u', query: union }] } })),
    ).toBe('WITH "u" AS (SELECT "id" FROM "a" UNION SELECT "id" FROM "b") SELECT "id" FROM "x"');
  });
});

describe('FETCH FIRST ... WITH TIES', () => {
  it('replaces LIMIT and binds the count', () => {
    const compiled = compiler.compile(
      select('a', { limit: 3, withTies: true, offset: 2, orderBy: [{ expr: ast.ident('id') }] }),
    );
    expect(compiled.text).toBe(
      'SELECT "id" FROM "a" ORDER BY "id" OFFSET $1 FETCH FIRST $2 ROWS WITH TIES',
    );
    expect(compiled.values).toEqual([2, 3]);
  });
});
