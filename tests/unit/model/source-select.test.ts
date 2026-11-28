import { describe, expect, it } from 'vitest';
import {
  DataTypes,
  Op,
  Sequelize,
  cast,
  col,
  exists,
  fn,
  literal,
  where,
} from '../../../src/index.ts';
import { sqlCompiler, cteBuilder, joinSources } from '../../../src/model/model-services.ts';
import type { SourceQueryOptions } from '../../../src/model/source-query-options.ts';
import { SourceSelectBuilder } from '../../../src/model/source-select-builder.ts';

const sequelize = new Sequelize('postgres://localhost/unused', { logging: false });
const User = sequelize.define(
  'User',
  { name: DataTypes.TEXT, refs: DataTypes.JSONB },
  { timestamps: false },
);

const builder = new SourceSelectBuilder(joinSources, cteBuilder);
const compile = (options: SourceQueryOptions) => sqlCompiler.compile(builder.build(options));

const unnest = {
  function: 'unnest',
  args: [cast([1, 2], 'integer[]')],
  columns: ['id'],
};

describe('SourceSelectBuilder', () => {
  it('selects from a multi-array unnest with bound arrays', () => {
    const query = compile({
      from: {
        t: {
          function: 'unnest',
          args: [cast([1], 'integer[]'), cast(['2026-01-01'], 'timestamptz[]')],
          columns: ['a', 'b'],
        },
      },
      attributes: ['t.a', [col('t.b'), 'at']],
      where: { '$t.a$': { [Op.gt]: 0 } },
      order: [[col('t.a'), 'DESC']],
      limit: 5,
    });
    expect(query.text).toBe(
      'SELECT "t"."a", "t"."b" AS "at" FROM "unnest"(CAST($1 AS integer[]), CAST($2 AS timestamptz[])) AS "t"("a", "b") WHERE "t"."a" > $3 ORDER BY "t"."a" DESC LIMIT $4',
    );
    expect(query.values).toEqual([[1], ['2026-01-01'], 0, 5]);
  });

  it('joins sources with LEFT JOIN and ON true by default', () => {
    const query = compile({
      from: { ids: unnest },
      attributes: ['ids.*', 'u.*'],
      joins: {
        u: { type: 'left', source: User, on: where(col('u.id'), col('ids.id')) },
        n: { source: { values: { columns: ['a'], rows: [[1]] } } },
      },
    });
    expect(query.text).toBe(
      'SELECT "ids".*, "u".* FROM "unnest"(CAST($1 AS integer[])) AS "ids"("id") LEFT OUTER JOIN "Users" AS "u" ON "u"."id" = "ids"."id" INNER JOIN (VALUES ($2)) AS "n"("a") ON true',
    );
  });

  it('works inside exists() with a reference to the outer alias', () => {
    const refs = sequelize.subquery({
      from: {
        ref: {
          function: 'jsonb_array_elements',
          args: [fn('jsonb_concat', col('User.refs'), col('User.refs'))],
          columns: ['value'],
        },
      },
      where: where(literal(`"ref"."value" ->> 'id'`), '1'),
    });
    const query = compile({ from: { User }, where: exists(refs) });
    expect(query.text).toBe(
      `SELECT * FROM "Users" AS "User" WHERE EXISTS (SELECT * FROM "jsonb_array_elements"(jsonb_concat("User"."refs", "User"."refs")) AS "ref"("value") WHERE "ref"."value" ->> 'id' = $1)`,
    );
  });

  it('rejects a missing source and an unknown join type', () => {
    expect(() => compile({ from: {} })).toThrow('from needs at least one source');
    expect(() =>
      compile({ from: { ids: unnest }, joins: { x: { type: 'full' as 'left', source: User } } }),
    ).toThrow('Invalid join type: full');
  });
});
