import { describe, expect, it } from 'vitest';
import { normalizeDefinition } from '../../../src/model/definition.ts';
import { buildSelect } from '../../../src/model/query-builders.ts';
import { DataTypes } from '../../../src/data-types/data-types.ts';
import { cast, col, fn, where } from '../../../src/expressions/methods.ts';
import { compile, compileExpr } from '../../../src/sql/compile.ts';
import { whereToAst } from '../../../src/where/where.ts';

const definition = normalizeDefinition('User', { name: DataTypes.STRING }, {});
const ctx = { resolve: () => undefined };

describe('injection surfaces', () => {
  it('quotes identifiers coming from attribute names and column references', () => {
    const query = compile(
      buildSelect(definition, {
        where: { 'na"me': 'x', '$a"b.c$': 1 },
        attributes: ['na"me'],
        order: [['x"; DROP TABLE t; --', 'ASC']],
        group: ['y"z'],
      }),
    );
    expect(query.text).toContain('"na""me"');
    expect(query.text).toContain('"x""; DROP TABLE t; --"');
    expect(query.text).not.toMatch(/DROP TABLE t; --[^"]/);
    expect(query.values).toEqual(['x', 1]);
  });

  it('binds where values and JSON path segments', () => {
    const json = normalizeDefinition('Doc', { meta: DataTypes.JSONB }, {});
    const query = compile(buildSelect(json, { where: { "meta.a') OR 1=1 --": "'; DROP" } }));
    expect(query.values).toEqual([["a') OR 1=1 --"], "'; DROP"]);
  });

  it('rejects order directions, string order, cast types, comparators and function names outside allowlists', () => {
    expect(() => buildSelect(definition, { order: [['name', 'ASC; DROP TABLE x']] })).toThrow(
      /Invalid order direction/,
    );
    expect(() => buildSelect(definition, { order: 'name; DROP TABLE x' })).toThrow(
      /Order must be type of array/,
    );
    expect(() => compileExpr(whereToAst({ 'name::text); DROP TABLE x; --': 1 }, ctx))).toThrow(
      /Invalid cast type/,
    );
    expect(() => compileExpr(whereToAst(where(col('a'), '= 1 OR 1=1 --', 1), ctx))).toThrow(
      /Invalid comparator/,
    );
    expect(() => fn('now(); DROP TABLE x; --')).toThrow(/Invalid function name/);
    expect(() => cast(1, 'int); DROP TABLE x; --')).toThrow(/Invalid cast type/);
  });

  it('accepts legitimate names', () => {
    expect(() => fn('pg_catalog.lower', 'A')).not.toThrow();
    expect(() => cast(1, 'numeric(10, 2)')).not.toThrow();
    expect(() => cast(1, 'text[]')).not.toThrow();
    expect(compileExpr(whereToAst({ 'name::TIMESTAMPTZ': 1 }, ctx)).text).toBe(
      'CAST("name" AS TIMESTAMPTZ) = $1',
    );
    expect(compileExpr(whereToAst(where(col('a'), 'NOT ILIKE', 'x'), ctx)).text).toBe(
      '"a" NOT ILIKE $1',
    );
  });
});
