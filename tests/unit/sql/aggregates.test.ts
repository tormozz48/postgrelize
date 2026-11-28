import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  DataTypes,
  Op,
  Sequelize,
  arrayAgg,
  arraySlice,
  col,
  cube,
  fn,
  grouping,
  groupingSets,
  jsonbAgg,
  literal,
  rollup,
  stringAgg,
  where,
  type ExpressionResult,
  type FindOptions,
} from '../../../src/index.ts';

const sequelize = new Sequelize('postgres://u:p@localhost:1/db', { logging: false });
const Sale = sequelize.define(
  'Sale',
  {
    region: DataTypes.TEXT,
    product: DataTypes.TEXT,
    soldAt: { type: DataTypes.DATE, field: 'sold_at' },
  },
  { timestamps: false },
);

const sql = (options: FindOptions): string =>
  sequelize
    .getQueryInterface()
    .queryGenerator.selectQuery(Sale.getTableName(), options as never, Sale as never);

const selected = (expression: unknown): string =>
  sql({ attributes: [[expression as never, 'x']] }).replace(/^SELECT (.*) AS "x" FROM .*$/, '$1');

const grouped = (group: unknown): string =>
  sql({ attributes: ['region'], group: group as never }).replace(/^.* GROUP BY (.*);$/, '$1');

describe('ordered aggregates', () => {
  it('renders ORDER BY and DISTINCT inside the call', () => {
    expect(selected(arrayAgg('id'))).toBe('array_agg("Sale"."id")');
    expect(selected(arrayAgg('id', { orderBy: [['soldAt', 'DESC NULLS LAST'], 'id'] }))).toBe(
      'array_agg("Sale"."id" ORDER BY "Sale"."sold_at" DESC NULLS LAST, "Sale"."id")',
    );
    expect(selected(arrayAgg('region', { distinct: true, orderBy: [['region', 'ASC']] }))).toBe(
      'array_agg(DISTINCT "Sale"."region" ORDER BY "Sale"."region" ASC)',
    );
    expect(selected(jsonbAgg(col('product'), { orderBy: [literal('2')] }))).toBe(
      'jsonb_agg("product" ORDER BY 2)',
    );
  });

  it('writes the string_agg separator as an escaped literal', () => {
    expect(selected(stringAgg('product', ', ', { orderBy: ['product'] }))).toBe(
      `string_agg("Sale"."product", ', ' ORDER BY "Sale"."product")`,
    );
    expect(selected(stringAgg('product', "'"))).toBe(`string_agg("Sale"."product", '''')`);
    expect(() => stringAgg('product', 1 as never)).toThrow('string separator');
  });

  it('slices the aggregate', () => {
    const ids = arrayAgg<number>('id', { orderBy: [['soldAt', 'DESC']] });
    expect(selected(arraySlice(ids, 1, 3))).toBe(
      '(array_agg("Sale"."id" ORDER BY "Sale"."sold_at" DESC))[1:3]',
    );
    expect(selected(arraySlice(ids, 2))).toMatch(/\)\[2:\]$/);
    expect(selected(arraySlice(ids, undefined, 2))).toMatch(/\)\[:2\]$/);
    expect(() => arraySlice(ids, 1.5)).toThrow('Invalid array slice bound');
    expect(() => arraySlice(ids, '1]' as never)).toThrow('Invalid array slice bound');
  });

  it('rejects an unknown order direction', () => {
    expect(() => selected(arrayAgg('id', { orderBy: [['id', 'DESC; --']] }))).toThrow(/order/i);
  });

  it('carries the result type', () => {
    const ids = arrayAgg<number>('id');
    expectTypeOf<ExpressionResult<typeof ids>>().toEqualTypeOf<number[] | null>();
    const first = arraySlice(ids, 1, 3);
    expectTypeOf<ExpressionResult<typeof first>>().toEqualTypeOf<number[] | null>();
    const names = stringAgg('product', ',');
    expectTypeOf<ExpressionResult<typeof names>>().toEqualTypeOf<string | null>();
    const bit = grouping('region');
    expectTypeOf<ExpressionResult<typeof bit>>().toEqualTypeOf<number>();
    expect(bit.name).toBe('GROUPING');
  });
});

describe('grouping clauses', () => {
  const region = '"Sale"."region"';
  const product = '"Sale"."product"';

  it('renders ROLLUP, CUBE and GROUPING SETS from runtime lists', () => {
    const dimensions = ['region', 'product'];
    expect(grouped(rollup(dimensions))).toBe(`ROLLUP (${region}, ${product})`);
    expect(grouped(cube(dimensions))).toBe(`CUBE (${region}, ${product})`);
    expect(grouped(groupingSets([dimensions, ['region'], []]))).toBe(
      `GROUPING SETS ((${region}, ${product}), (${region}), ())`,
    );
  });

  it('mixes with plain items, composite columns and nesting', () => {
    expect(grouped(['soldAt', rollup([['region', 'product']])])).toBe(
      `"Sale"."sold_at", ROLLUP ((${region}, ${product}))`,
    );
    expect(grouped(groupingSets([rollup(['region']), 'product']))).toBe(
      `GROUPING SETS (ROLLUP (${region}), ${product})`,
    );
  });

  it('renders GROUPING() in attributes, having and order', () => {
    expect(selected(grouping('region', 'soldAt'))).toBe(`GROUPING(${region}, "Sale"."sold_at")`);
    const text = sql({
      attributes: ['region', [fn('count', col('id')), 'n']],
      group: [rollup(['region'])] as never,
      having: where(grouping('region'), Op.eq, 0),
      order: [[grouping('region'), 'DESC']],
    });
    expect(text).toContain(`HAVING GROUPING(${region}) = 0 ORDER BY GROUPING(${region}) DESC`);
  });

  it('rejects empty lists', () => {
    expect(() => rollup([])).toThrow('ROLLUP needs at least one item');
    expect(() => cube([])).toThrow('CUBE needs at least one item');
    expect(() => groupingSets([])).toThrow('GROUPING SETS needs at least one item');
    expect(() => grouped(rollup([[]]))).toThrow('ROLLUP cannot hold an empty list');
  });
});
