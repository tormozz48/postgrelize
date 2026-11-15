import { describe, expect, it } from 'vitest';
import { col, fn, json, over } from '../../../src/expressions/methods.ts';
import { Op } from '../../../src/expressions/op.ts';
import { SqlCompiler } from '../../../src/sql/compile.ts';
import { WhereCompiler, type AttributeRef, type WhereContext } from '../../../src/where/where.ts';

const refs: Record<string, AttributeRef> = {
  id: { field: 'id' },
  firstName: { field: 'first_name' },
};

const ctx: WhereContext = { tableAlias: 'User', resolve: (name) => refs[name] };

const compiler = new SqlCompiler();

const sql = (value: unknown) => compiler.compileExpr(new WhereCompiler(ctx).compile(value));

describe('where: top-level operators', () => {
  it('rejects a comparison operator at the top level', () => {
    expect(() => sql({ [Op.eq]: 1 })).toThrow('Invalid top-level where operator');
  });

  it('splits an object under Op.and and Op.or into separate conditions', () => {
    expect(sql({ [Op.and]: { id: 1, firstName: 'a' } })).toEqual({
      text: '("User"."id" = $1 AND "User"."first_name" = $2)',
      values: [1, 'a'],
    });
    expect(sql({ [Op.or]: { id: 1, firstName: 'a' } })).toEqual({
      text: '("User"."id" = $1 OR "User"."first_name" = $2)',
      values: [1, 'a'],
    });
  });

  it('wraps a single non-object condition under Op.or', () => {
    expect(sql({ [Op.or]: json('firstName', 'a') })).toEqual({
      text: '"User"."first_name" = $1',
      values: ['a'],
    });
  });

  it('negates a condition with Op.not', () => {
    expect(sql({ [Op.not]: { id: 1 } })).toEqual({
      text: 'NOT "User"."id" = $1',
      values: [1],
    });
  });
});

describe('where: json() with a conditions object', () => {
  it('compiles the conditions as a where clause', () => {
    expect(sql(json({ id: 3, firstName: 'x' }))).toEqual({
      text: '("User"."id" = $1 AND "User"."first_name" = $2)',
      values: [3, 'x'],
    });
  });
});

describe('where: window functions', () => {
  it('compiles partition and order items given as attributes, expressions and pairs', () => {
    const window = over(fn('row_number'), {
      partitionBy: ['firstName', col('other')],
      orderBy: ['id', ['firstName', 'DESC'], [col('created')], [fn('lower', col('x')), 'ASC']],
    });
    expect(sql(window)).toEqual({
      text: 'row_number() OVER (PARTITION BY "User"."first_name", "other" ORDER BY "User"."id", "User"."first_name" DESC, "created", lower("x") ASC)',
      values: [],
    });
  });

  it('omits empty partition and order clauses', () => {
    expect(sql(over(fn('rank')))).toEqual({ text: 'rank() OVER ()', values: [] });
    expect(sql(over(fn('rank'), { orderBy: ['id'] })).text).toBe(
      'rank() OVER (ORDER BY "User"."id")',
    );
    expect(sql(over(fn('rank'), { partitionBy: ['id'] })).text).toBe(
      'rank() OVER (PARTITION BY "User"."id")',
    );
  });

  it('rejects an invalid order direction', () => {
    expect(() => sql(over(fn('rank'), { orderBy: [['id', 'SIDEWAYS']] }))).toThrow(/SIDEWAYS/);
  });
});
