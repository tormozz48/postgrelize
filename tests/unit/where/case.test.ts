import { describe, expect, it } from 'vitest';
import { caseWhen, col, fn, tuple, where } from '../../../src/expressions/methods.ts';
import { Op } from '../../../src/expressions/op.ts';
import { SqlCompiler } from '../../../src/sql/compile.ts';
import { WhereCompiler, type WhereContext } from '../../../src/where/where.ts';

const ctx: WhereContext = { tableAlias: 'T', resolve: (name) => ({ field: name }) };
const compiler = new SqlCompiler();
const sql = (value: unknown) => compiler.compileExpr(new WhereCompiler(ctx).compile(value));

describe('caseWhen', () => {
  it('compiles where-style conditions with bound results', () => {
    const rank = caseWhen()
      .when({ status: 'open' }, 'first')
      .when({ [Op.or]: [{ a: 1 }, { b: null }] }, col('b'))
      .else(fn('lower', col('c')));
    expect(sql(where(rank, 'x'))).toEqual({
      text: 'CASE WHEN "T"."status" = $1 THEN $2 WHEN ("T"."a" = $3 OR "T"."b" IS NULL) THEN "b" ELSE lower("c") END = $4',
      values: ['open', 'first', 1, 'x'],
    });
  });

  it.each([
    [1, 'integer'],
    [3_000_000_000, 'bigint'],
    [1.5, 'double precision'],
    [2n, 'bigint'],
    [true, 'boolean'],
    [new Date(0), 'timestamptz'],
  ])('casts a %s result so PostgreSQL does not read it as text', (value, type) => {
    const { text, values } = sql(where(caseWhen().when({ a: 1 }, value), null));
    expect(text).toBe(`CASE WHEN "T"."a" = $1 THEN CAST($2 AS ${type}) END IS NULL`);
    expect(values).toEqual([1, value]);
  });

  it('works as the value of an attribute condition, with ELSE NULL', () => {
    expect(sql({ a: { [Op.gt]: caseWhen().when({ b: 1 }, col('c')).else(null) } })).toEqual({
      text: '"T"."a" > CASE WHEN "T"."b" = $1 THEN "c" ELSE $2 END',
      values: [1, null],
    });
  });

  it('is immutable, so a partial expression can be reused', () => {
    const base = caseWhen().when({ a: 1 }, 'x');
    expect(base.else('y')).not.toBe(base);
    expect(base.branches).toHaveLength(1);
    expect(base.otherwise).toBeUndefined();
  });

  it('rejects an expression without a branch', () => {
    expect(() => sql(where(caseWhen().else(1), 1))).toThrow('at least one when');
  });
});

describe('row-wise distinctness', () => {
  it.each([
    [Op.isDistinctFrom, 'IS DISTINCT FROM'],
    [Op.isNotDistinctFrom, 'IS NOT DISTINCT FROM'],
  ])('compiles %s between tuples', (op, text) => {
    expect(sql(where(tuple(col('a'), col('b')), op, tuple(1, null)))).toEqual({
      text: `("a", "b") ${text} ($1, $2)`,
      values: [1, null],
    });
  });
});

describe('Op.any of an expression', () => {
  it('renders an array column instead of binding it', () => {
    expect(sql({ id: { [Op.any]: col('kids') } })).toEqual({
      text: '"T"."id" = ANY("kids")',
      values: [],
    });
  });
});
