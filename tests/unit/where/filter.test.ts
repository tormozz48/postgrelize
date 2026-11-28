import { describe, expect, it } from 'vitest';
import { cast, col, filter, fn, literal, over, where } from '../../../src/expressions/methods.ts';
import { Op } from '../../../src/expressions/op.ts';
import { SqlCompiler } from '../../../src/sql/compile.ts';
import { WhereCompiler, type WhereContext } from '../../../src/where/where.ts';

const ctx: WhereContext = { tableAlias: 'T', resolve: (name) => ({ field: name }) };
const compiler = new SqlCompiler();
const sql = (value: unknown) => compiler.compileExpr(new WhereCompiler(ctx).compile(value));

describe('filter()', () => {
  it('compiles COUNT(*) FILTER with a bound value', () => {
    expect(sql(filter(fn('COUNT', col('*')), { debit: 7 }))).toEqual({
      text: 'COUNT(*) FILTER (WHERE "T"."debit" = $1)',
      values: [7],
    });
  });

  it('wraps several conditions and COUNT(DISTINCT) in parentheses', () => {
    const value = filter(fn('COUNT', fn('DISTINCT', col('x.id'))), {
      [Op.and]: [{ a: { [Op.in]: [1, 2] } }, { b: { [Op.eq]: col('x.b') } }],
    });
    expect(sql(value).text).toBe(
      'COUNT(DISTINCT("x"."id")) FILTER (WHERE ("T"."a" IN ($1, $2) AND "T"."b" = "x"."b"))',
    );
  });

  it('combines with over(), where() and cast()', () => {
    const sum = filter(fn('SUM', col('amount')), { debit: 7 });
    expect(sql(over(sum, { partitionBy: ['book'] })).text).toBe(
      'SUM("amount") FILTER (WHERE "T"."debit" = $1) OVER (PARTITION BY "T"."book")',
    );
    expect(sql(where(cast(sum, 'integer'), Op.gt, 0)).text).toBe(
      'CAST(SUM("amount") FILTER (WHERE "T"."debit" = $1) AS integer) > $2',
    );
  });

  it('accepts a literal aggregate and writes an empty condition as TRUE', () => {
    expect(sql(filter(literal('count(*)'), {})).text).toBe('count(*) FILTER (WHERE TRUE)');
  });

  it('rejects an undefined value in the condition', () => {
    expect(() => sql(filter(fn('COUNT', col('*')), { debit: undefined }))).toThrow(/undefined/);
  });
});
