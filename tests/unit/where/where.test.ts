import { describe, expect, it } from 'vitest';
import { cast, col, fn, json, literal, where } from '../../../src/expressions/methods.ts';
import { Op } from '../../../src/expressions/op.ts';
import { SqlCompiler } from '../../../src/sql/compile.ts';
import { WhereCompiler, type AttributeRef, type WhereContext } from '../../../src/where/where.ts';

const refs: Record<string, AttributeRef> = {
  id: { field: 'id' },
  firstName: { field: 'first_name' },
  meta: { field: 'meta', isJson: true, serialize: (value) => JSON.stringify(value) },
};

const ctx: WhereContext = { tableAlias: 'User', resolve: (name) => refs[name] };

const compiler = new SqlCompiler();

const sql = (value: unknown, context: WhereContext = ctx) =>
  compiler.compileExpr(new WhereCompiler(context).compile(value));

describe('whereToAst', () => {
  it('maps attributes to fields and qualifies with table alias', () => {
    expect(sql({ firstName: 'a', id: 1 })).toEqual({
      text: '("User"."first_name" = $1 AND "User"."id" = $2)',
      values: ['a', 1],
    });
  });

  it('handles null, arrays and empty arrays', () => {
    expect(sql({ id: null }).text).toBe('"User"."id" IS NULL');
    expect(sql({ id: [1, 2] })).toEqual({ text: '"User"."id" IN ($1, $2)', values: [1, 2] });
    expect(sql({ id: [] }).text).toBe('FALSE');
    expect(sql({ id: { [Op.notIn]: [] } }).text).toBe('TRUE');
  });

  it('compiles long IN lists to = ANY with a single array param', () => {
    const ids = Array.from({ length: 101 }, (_, i) => i);
    expect(sql({ id: ids })).toEqual({ text: '"User"."id" = ANY($1)', values: [ids] });
    expect(sql({ id: { [Op.notIn]: ids } }).text).toBe('"User"."id" <> ALL($1)');
  });

  it.each([
    [{ [Op.eq]: 1 }, '"User"."id" = $1'],
    [{ [Op.ne]: 1 }, '"User"."id" <> $1'],
    [{ [Op.ne]: null }, '"User"."id" IS NOT NULL'],
    [{ [Op.gt]: 1, [Op.lte]: 5 }, '("User"."id" > $1 AND "User"."id" <= $2)'],
    [{ [Op.is]: null }, '"User"."id" IS NULL'],
    [{ [Op.not]: true }, '"User"."id" IS NOT TRUE'],
    [{ [Op.not]: 3 }, '"User"."id" <> $1'],
    [{ [Op.between]: [1, 2] }, '"User"."id" BETWEEN $1 AND $2'],
    [{ [Op.notBetween]: [1, 2] }, '"User"."id" NOT BETWEEN $1 AND $2'],
    [{ [Op.like]: 'a%' }, '"User"."id" LIKE $1'],
    [{ [Op.iLike]: { [Op.any]: ['a%', 'b%'] } }, '"User"."id" ILIKE ANY($1)'],
    [{ [Op.gt]: { [Op.all]: { [Op.values]: [1, 2] } } }, '"User"."id" > ALL(VALUES ($1), ($2))'],
    [{ [Op.regexp]: '^a' }, '"User"."id" ~ $1'],
    [{ [Op.notIRegexp]: '^a' }, '"User"."id" !~* $1'],
    [{ [Op.overlap]: [1] }, '"User"."id" && $1'],
    [{ [Op.contains]: [1] }, '"User"."id" @> $1'],
    [{ [Op.adjacent]: [1, 2] }, '"User"."id" -|- $1'],
    [{ [Op.col]: 'Other.id' }, '"User"."id" = "Other"."id"'],
    [{ [Op.or]: [1, 2] }, '("User"."id" = $1 OR "User"."id" = $2)'],
    [{ [Op.not]: { [Op.in]: [1] } }, 'NOT "User"."id" IN ($1)'],
    [{ [Op.isDistinctFrom]: 1 }, '"User"."id" IS DISTINCT FROM $1'],
    [{ [Op.isNotDistinctFrom]: null }, '"User"."id" IS NOT DISTINCT FROM $1'],
    [{ [Op.hasKey]: 'a' }, '"User"."id" ? $1'],
    [{ [Op.hasAnyKeys]: ['a'] }, '"User"."id" ?| $1'],
    [{ [Op.hasAllKeys]: ['a'] }, '"User"."id" ?& $1'],
  ])('operator %#', (condition, text) => {
    expect(sql({ id: condition }).text).toBe(text);
  });

  it('builds LIKE patterns for startsWith/endsWith/substring', () => {
    expect(sql({ firstName: { [Op.startsWith]: 'a' } }).values).toEqual(['a%']);
    expect(sql({ firstName: { [Op.endsWith]: 'a' } }).values).toEqual(['%a']);
    expect(sql({ firstName: { [Op.substring]: 'a' } }).values).toEqual(['%a%']);
  });

  it('supports top-level and/or/not', () => {
    expect(sql({ [Op.or]: [{ id: 1 }, { firstName: 'a' }] }).text).toBe(
      '("User"."id" = $1 OR "User"."first_name" = $2)',
    );
    expect(sql({ [Op.or]: { id: 1, firstName: 'a' } }).text).toBe(
      '("User"."id" = $1 OR "User"."first_name" = $2)',
    );
    expect(sql({ [Op.not]: { id: 1 } }).text).toBe('NOT "User"."id" = $1');
    expect(sql([{ id: 1 }, { id: 2 }]).text).toBe('("User"."id" = $1 AND "User"."id" = $2)');
  });

  it('supports nested JSON objects, dotted keys and casts by value type', () => {
    expect(sql({ meta: { a: { b: 1 } } })).toEqual({
      text: 'CAST("User"."meta" #>> $1 AS double precision) = $2',
      values: [['a', 'b'], '1'],
    });
    expect(sql({ 'meta.flag': true }).text).toBe('CAST("User"."meta" #>> $1 AS boolean) = $2');
    expect(sql({ 'meta.name': { [Op.iLike]: 'x%' } }).text).toBe('"User"."meta" #>> $1 ILIKE $2');
  });

  it('does not serialize jsonb key operator values', () => {
    expect(sql({ meta: { [Op.hasKey]: 'a' } }).values).toEqual(['a']);
    expect(sql({ meta: { [Op.hasAnyKeys]: ['a', 'b'] } }).values).toEqual([['a', 'b']]);
  });

  it('serializes values for typed attributes', () => {
    expect(sql({ meta: { [Op.contains]: { a: 1 } } }).values).toEqual(['{"a":1}']);
  });

  it('supports $nested.column$ keys and ::cast suffix', () => {
    expect(sql({ '$posts.title$': 'x' }).text).toBe('"posts"."title" = $1');
    expect(sql({ 'id::text': '1' }).text).toBe('CAST("User"."id" AS text) = $1');
  });

  it('supports expression builders', () => {
    expect(sql(where(fn('lower', col('User.first_name')), 'bob'))).toEqual({
      text: 'lower("User"."first_name") = $1',
      values: ['bob'],
    });
    expect(sql(where(col('id'), Op.gt, 5)).text).toBe('"id" > $1');
    expect(sql(where(literal('1'), '<', cast('2', 'int'))).text).toBe('1 < CAST($1 AS int)');
    expect(sql({ id: literal('42') }).text).toBe('"User"."id" = 42');
    expect(sql(json('meta.a', 'x')).text).toBe('"User"."meta" #>> $1 = $2');
  });

  it('rejects invalid input', () => {
    expect(() => sql('id = 1')).toThrow(/Invalid where/);
    expect(() => sql({ id: { [Op.between]: [1] } })).toThrow(/two values/);
  });
});

describe('v6 parity: fn() strings, Op.is values, col() paths', () => {
  it("writes a string argument of fn() as an escaped literal, like v6 COUNT('*')", () => {
    expect(sql(where(fn('concat_ws', ' ', col('a'), "it's"), Op.ne, 'x'))).toEqual({
      text: "concat_ws(' ', \"a\", 'it''s') <> $1",
      values: ['x'],
    });
  });

  it('keeps other fn() arguments bound', () => {
    expect(sql(where(fn('round', col('a'), 2), '>', 1))).toEqual({
      text: 'round("a", $1) > $2',
      values: [2, 1],
    });
  });

  it('accepts a literal, an expression or any value after Op.is', () => {
    expect(sql({ id: { [Op.is]: literal('NULL') } }).text).toBe('"User"."id" IS NULL');
    expect(sql({ id: { [Op.is]: null } }).text).toBe('"User"."id" IS NULL');
    expect(sql({ id: { [Op.is]: false } }).text).toBe('"User"."id" IS FALSE');
    expect(sql({ id: { [Op.is]: 5 } }).text).toBe('"User"."id" IS 5');
    expect(sql({ id: { [Op.is]: "x'y" } }).text).toBe(`"User"."id" IS 'x''y'`);
  });

  it('joins all but the last part of a col() path with ->', () => {
    expect(sql(where(fn('lower', col('user.agent.id')), Op.ne, 'x')).text).toBe(
      'lower("user->agent"."id") <> $1',
    );
    expect(sql(where(fn('lower', col('user.id')), Op.ne, 'x')).text).toBe(
      'lower("user"."id") <> $1',
    );
  });

  it('joins the entries of an Op.or / Op.and object value with the operator itself', () => {
    expect(sql({ id: { [Op.or]: { [Op.is]: null, [Op.eq]: 5 } } })).toEqual({
      text: '("User"."id" IS NULL OR "User"."id" = $1)',
      values: [5],
    });
    expect(sql({ id: { [Op.and]: { [Op.gt]: 1, [Op.lt]: 9 } } }).text).toBe(
      '("User"."id" > $1 AND "User"."id" < $2)',
    );
  });
});
