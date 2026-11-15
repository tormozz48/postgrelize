import { describe, expect, it } from 'vitest';
import { AttributeColumns } from '../../../src/model/attribute-columns.ts';
import { ModelDefinition } from '../../../src/model/model-definition.ts';
import { SelectQueryBuilder } from '../../../src/model/select-query-builder.ts';
import { DataTypes } from '../../../src/data-types/data-types.ts';
import { cast, col, fn, where } from '../../../src/expressions/methods.ts';
import type { ExprNode, StatementNode } from '../../../src/sql/ast.ts';
import { SqlCompiler } from '../../../src/sql/compile.ts';
import { WhereCompiler } from '../../../src/where/where.ts';

const definition = ModelDefinition.normalize('User', { name: DataTypes.STRING }, {});
const compiler = new SqlCompiler();
const selects = new SelectQueryBuilder(new AttributeColumns());
const compile = (node: StatementNode) => compiler.compile(node);
const compileExpr = (node: ExprNode) => compiler.compileExpr(node);
const ctx = new WhereCompiler({ resolve: () => undefined });

describe('injection surfaces', () => {
  it('quotes identifiers coming from attribute names and column references', () => {
    const query = compile(
      selects.build(definition, {
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
    const json = ModelDefinition.normalize('Doc', { meta: DataTypes.JSONB }, {});
    const query = compile(selects.build(json, { where: { "meta.a') OR 1=1 --": "'; DROP" } }));
    expect(query.values).toEqual([["a') OR 1=1 --"], "'; DROP"]);
  });

  it('rejects order directions, string order, cast types, comparators and function names outside allowlists', () => {
    expect(() => selects.build(definition, { order: [['name', 'ASC; DROP TABLE x']] })).toThrow(
      /Invalid order direction/,
    );
    expect(() => selects.build(definition, { order: 'name; DROP TABLE x' })).toThrow(
      /Order must be type of array/,
    );
    expect(() => compileExpr(ctx.compile({ 'name::text); DROP TABLE x; --': 1 }))).toThrow(
      /Invalid cast type/,
    );
    expect(() => compileExpr(ctx.compile(where(col('a'), '= 1 OR 1=1 --', 1)))).toThrow(
      /Invalid comparator/,
    );
    expect(() => fn('now(); DROP TABLE x; --')).toThrow(/Invalid function name/);
    expect(() => cast(1, 'int); DROP TABLE x; --')).toThrow(/Invalid cast type/);
  });

  it('accepts legitimate names', () => {
    expect(() => fn('pg_catalog.lower', 'A')).not.toThrow();
    expect(() => cast(1, 'numeric(10, 2)')).not.toThrow();
    expect(() => cast(1, 'text[]')).not.toThrow();
    expect(compileExpr(ctx.compile({ 'name::TIMESTAMPTZ': 1 })).text).toBe(
      'CAST("name" AS TIMESTAMPTZ) = $1',
    );
    expect(compileExpr(ctx.compile(where(col('a'), 'NOT ILIKE', 'x'))).text).toBe(
      '"a" NOT ILIKE $1',
    );
  });
});
