import { describe, expect, it } from 'vitest';
import { jsonbPath } from '../../../src/expressions/jsonpath-helpers.ts';
import { col, where } from '../../../src/expressions/methods.ts';
import { Op } from '../../../src/expressions/op.ts';
import {
  phraseToTsQuery,
  plainToTsQuery,
  setWeight,
  toTsQuery,
  toTsVector,
  tsHeadline,
  tsRank,
  websearchToTsQuery,
} from '../../../src/expressions/search-helpers.ts';
import {
  trigramDistance,
  trigramSimilarity,
  trigramWordSimilarity,
} from '../../../src/expressions/trigram-helpers.ts';
import { SqlCompiler } from '../../../src/sql/compile.ts';
import { WhereCompiler, type WhereContext } from '../../../src/where/where.ts';

const ctx: WhereContext = { tableAlias: 'T', resolve: (name) => ({ field: name }) };
const compiler = new SqlCompiler();
const sql = (value: unknown) => compiler.compileExpr(new WhereCompiler(ctx).compile(value));

describe('operator helpers: Op entries', () => {
  it.each([
    [Op.similarTo, 'SIMILAR TO'],
    [Op.notSimilarTo, 'NOT SIMILAR TO'],
    [Op.jsonPathExists, '@?'],
    [Op.containedOrEqual, '<<='],
    [Op.containsOrEqual, '>>='],
    [Op.trigramSimilar, '%'],
    [Op.trigramWordSimilar, '<%'],
    [Op.trigramStrictWordSimilar, '<<%'],
    [Op.trigramHasSimilarWord, '%>'],
    [Op.trigramHasSimilarStrictWord, '%>>'],
  ])('compiles %s with a bound value', (op, text) => {
    expect(sql({ a: { [op]: 'x' } })).toEqual({ text: `"T"."a" ${text} $1`, values: ['x'] });
  });
});

describe('operator helpers: expressions', () => {
  it('compiles text search constructors with and without a configuration', () => {
    expect(sql(where(toTsVector(col('body'), 'english'), Op.match, plainToTsQuery('a b')))).toEqual(
      {
        text: `to_tsvector(CAST($1 AS regconfig), "body") @@ plainto_tsquery($2)`,
        values: ['english', 'a b'],
      },
    );
    expect(sql(where(col('v'), Op.match, toTsQuery('a & b', 'simple'))).text).toBe(
      `"v" @@ to_tsquery(CAST($1 AS regconfig), $2)`,
    );
    expect(sql(where(col('v'), Op.match, phraseToTsQuery('a b'))).text).toContain(
      'phraseto_tsquery',
    );
    expect(
      sql(where(col('v'), Op.match, websearchToTsQuery('a', 'pg_catalog.english'))).text,
    ).toContain('websearch_to_tsquery(CAST($1 AS regconfig), $2)');
  });

  it('compiles ranking, headline and weights', () => {
    const query = websearchToTsQuery('a');
    expect(sql(where(tsRank(col('v'), query), '>', 0)).text).toBe(
      'ts_rank("v", websearch_to_tsquery($1)) > $2',
    );
    expect(
      sql(
        where(
          tsRank(col('v'), query, { cd: true, weights: [0.1, 0.2, 0.4, 1], normalization: 2 }),
          '>',
          0,
        ),
      ).text,
    ).toBe(
      'ts_rank_cd(CAST($1 AS real[]), "v", websearch_to_tsquery($2), CAST($3 AS integer)) > $4',
    );
    expect(
      sql(
        where(
          tsHeadline(col('b'), query, { config: 'english', options: 'StartSel=<b>' }),
          '=',
          'x',
        ),
      ).text,
    ).toBe(
      'ts_headline(CAST($1 AS regconfig), "b", websearch_to_tsquery($2), CAST($3 AS text)) = $4',
    );
    expect(sql(where(setWeight(col('v'), 'A'), '=', 1)).text).toBe(`setweight("v", 'A') = $1`);
  });

  it('compiles jsonb path functions', () => {
    expect(sql(where(jsonbPath('exists', col('d'), '$.a'), true)).text).toBe(
      'jsonb_path_exists("d", CAST($1 AS jsonpath)) = $2',
    );
    expect(
      sql(
        where(
          jsonbPath('queryFirst', col('d'), '$.a ? (@ > $m)', {
            vars: { m: 1 },
            silent: true,
            tz: true,
          }),
          1,
        ),
      ),
    ).toEqual({
      text: 'jsonb_path_query_first_tz("d", CAST($1 AS jsonpath), CAST($2 AS jsonb), CAST($3 AS boolean)) = $4',
      values: ['$.a ? (@ > $m)', '{"m":1}', true, 1],
    });
    expect(sql(where(jsonbPath('match', col('d'), '$.a', { silent: false }), true)).text).toContain(
      'CAST($2 AS jsonb), CAST($3 AS boolean)',
    );
  });

  it('compiles pg_trgm helpers', () => {
    expect(sql(where(trigramSimilarity(col('n'), 'bob'), '>', 0.3))).toEqual({
      text: 'similarity("n", $1) > $2',
      values: ['bob', 0.3],
    });
    expect(sql(where(trigramWordSimilarity('a', col('n')), '>', 0.3)).text).toBe(
      'word_similarity($1, "n") > $2',
    );
    expect(sql(where(trigramDistance(col('n'), 'bob'), '<', 0.5))).toEqual({
      text: '"n" <-> $1 < $2',
      values: ['bob', 0.5],
    });
  });

  it('rejects unsafe or malformed inputs', () => {
    expect(() => toTsVector(col('a'), 'english; DROP TABLE x')).toThrow(
      'Invalid text search configuration',
    );
    expect(() => tsHeadline('a', 'b', { config: "x'" })).toThrow(
      'Invalid text search configuration',
    );
    expect(() => setWeight(col('v'), "A'" as 'A')).toThrow('Invalid text search weight');
    expect(() => tsRank('a', 'b', { weights: [1, 2, 3] as never })).toThrow('four finite numbers');
    expect(() => tsRank('a', 'b', { weights: [1, 2, 3, Number.NaN] })).toThrow(
      'four finite numbers',
    );
    expect(() => tsRank('a', 'b', { normalization: 64 })).toThrow('integer from 0 to 63');
    expect(() => tsRank('a', 'b', { normalization: 1.5 })).toThrow('integer from 0 to 63');
    expect(() => jsonbPath('x; --' as 'exists', col('d'), '$')).toThrow(
      'Invalid jsonb path function',
    );
  });
});
