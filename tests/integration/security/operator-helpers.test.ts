import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DataTypes,
  Op,
  col,
  jsonbPath,
  phraseToTsQuery,
  plainToTsQuery,
  setWeight,
  toTsQuery,
  toTsVector,
  trigramDistance,
  trigramSimilarity,
  trigramWordSimilarity,
  tsHeadline,
  tsRank,
  websearchToTsQuery,
  where,
  type Model,
} from '../../../src/index.ts';
import {
  PAYLOADS,
  propertyParameters,
  settle,
  textValue,
  withCanary,
  type CanaryContext,
} from '../../support/injection.ts';
import { registerFileDatabase } from '../../support/file-database-hooks.ts';

// pg_trgm is database-wide: parallel files would collide in a shared database.
registerFileDatabase();

const codeOf = (result: unknown): string | undefined =>
  (result as { original?: { code?: string } } | undefined)?.original?.code;

const byVar = (needle: string) =>
  where(jsonbPath('exists', col('attrs'), '$.k ? (@ == $v)', { vars: { v: needle } }), true);

const NOT_CONFIG_NAMES = PAYLOADS.filter((payload) => !/^[A-Za-z_][\w$]*$/.test(payload));

const SIMILAR_META = /[%_|*+?{}()[\]\\]/g;

const defineItem = async ({ sequelize }: CanaryContext) => {
  await sequelize.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
  const Item = sequelize.define(
    'Item',
    { code: DataTypes.TEXT, attrs: DataTypes.JSONB, ip: DataTypes.INET },
    { timestamps: false },
  );
  await Item.sync();
  return Item;
};

const codes = async (found: Promise<readonly Model[]>) =>
  (await found).map((row) => row.get('code'));

describe('S17 operator helpers keep values bound', () => {
  it('matches arbitrary strings with escaped SIMILAR TO patterns and rejects nothing else', () =>
    withCanary(async (context) => {
      const Item = await defineItem(context);
      await fc.assert(
        fc.asyncProperty(textValue(), async (value) => {
          await Item.destroy({ where: {}, truncate: true });
          await Item.create({ code: value });
          const pattern = value.replaceAll(SIMILAR_META, '\\$&');
          const found = (condition: symbol, text: string) =>
            codes(Item.findAll({ where: { code: { [condition]: text } } }));
          expect(await found(Op.similarTo, pattern)).toEqual([value]);
          expect(await found(Op.notSimilarTo, pattern)).toEqual([]);
          const result = await settle(found(Op.similarTo, value));
          expect(codeOf(result)).not.toBe('42601');
        }),
        propertyParameters(),
      );
      for (const payload of PAYLOADS) {
        expect(
          codeOf(
            await settle(codes(Item.findAll({ where: { code: { [Op.similarTo]: payload } } }))),
          ),
        ).not.toBe('42601');
      }
    }));

  it('binds jsonpath, variables and options of the jsonb helpers', () =>
    withCanary(async (context) => {
      const Item = await defineItem(context);
      await fc.assert(
        fc.asyncProperty(textValue(), textValue(), async (value, other) => {
          fc.pre(value !== other);
          await Item.destroy({ where: {}, truncate: true });
          await Item.create({ code: 'x', attrs: { k: value } });
          const literalPath = `$.k ? (@ == ${JSON.stringify(value)})`;
          const count = (condition: unknown) => Item.count({ where: condition as never });
          expect(await count({ attrs: { [Op.jsonPathExists]: literalPath } })).toBe(1);
          expect(
            await count(where(col('attrs'), Op.match, `$.k == ${JSON.stringify(value)}`)),
          ).toBe(1);
          expect(await count(byVar(value))).toBe(1);
          expect(await count(byVar(other))).toBe(0);
          const silent = where(
            jsonbPath('match', col('attrs'), '$.nope == $v', {
              vars: { v: value },
              silent: true,
              tz: true,
            }),
            true,
          );
          expect(await count(silent)).toBe(0);
        }),
        propertyParameters(),
      );
      for (const payload of PAYLOADS) {
        const path = `$.k ? (@ == ${JSON.stringify(payload)})`;
        expect(
          await Item.count({ where: where(jsonbPath('exists', col('attrs'), path), true) }),
        ).toBe(0);
        await Item.count({ where: { attrs: { [Op.jsonPathExists]: path } } });
        await settle(
          Item.count({ where: where(jsonbPath('exists', col('attrs'), payload), true) }),
        );
        await settle(Item.count({ where: { attrs: { [Op.jsonPathExists]: payload } } }));
      }
    }));

  it('binds subnet operator values', () =>
    withCanary(async (context) => {
      const Item = await defineItem(context);
      await Item.create({ code: 'a', ip: '10.0.0.1' });
      for (const payload of PAYLOADS) {
        for (const op of [
          Op.containedOrEqual,
          Op.containsOrEqual,
          Op.strictLeft,
          Op.strictRight,
          Op.overlap,
        ]) {
          const result = await settle(Item.count({ where: { ip: { [op]: payload } } }));
          expect(codeOf(result)).not.toBe('42601');
        }
      }
    }));

  it('binds text search input and validates configurations', () =>
    withCanary(async (context) => {
      const Item = await defineItem(context);
      await fc.assert(
        fc.asyncProperty(textValue(), async (value) => {
          await Item.destroy({ where: {}, truncate: true });
          await Item.create({ code: value });
          const vector = toTsVector(col('code'), 'simple');
          for (const make of [websearchToTsQuery, plainToTsQuery, phraseToTsQuery]) {
            const query = make(value, 'simple');
            const rows = await Item.findAll({
              attributes: [
                [tsRank(vector, query, { cd: true, normalization: 32 }), 'rank'],
                [tsHeadline(col('code'), query, { config: 'simple' }), 'excerpt'],
              ],
              where: where(vector, Op.match, query),
              order: [[tsRank(vector, query), 'DESC']],
              raw: true,
            });
            expect(rows.length).toBeLessThanOrEqual(1);
          }
          // to_tsquery parses tsquery syntax, so malformed text is a legitimate 42601; the canary proves nothing was injected.
          await settle(Item.count({ where: where(vector, Op.match, toTsQuery(value, 'simple')) }));
        }),
        propertyParameters(),
      );
      for (const payload of NOT_CONFIG_NAMES) {
        for (const config of [
          () => toTsVector(col('code'), payload),
          () => websearchToTsQuery('x', payload),
          () => tsHeadline('x', 'y', { config: payload }),
        ]) {
          expect(config).toThrow('Invalid text search configuration');
        }
      }
      for (const payload of PAYLOADS) {
        expect(() => setWeight(col('v'), payload as 'A')).toThrow('Invalid text search weight');
        expect(() => jsonbPath(payload as 'exists', col('attrs'), '$')).toThrow(
          'Invalid jsonb path function',
        );
        const options = tsHeadline(col('code'), plainToTsQuery('x', 'simple'), {
          options: payload,
        });
        // Malformed option text is the parser's own syntax error; the canary proves nothing was injected.
        await settle(Item.findAll({ attributes: [[options, 'h']], raw: true }));
      }
    }));

  it('binds trigram operator and function values', () =>
    withCanary(async (context) => {
      const Item = await defineItem(context);
      await fc.assert(
        fc.asyncProperty(textValue(), async (value) => {
          await Item.destroy({ where: {}, truncate: true });
          await Item.create({ code: value });
          const ops = [
            Op.trigramSimilar,
            Op.trigramWordSimilar,
            Op.trigramStrictWordSimilar,
            Op.trigramHasSimilarWord,
            Op.trigramHasSimilarStrictWord,
          ];
          for (const op of ops) {
            expect(
              (await Item.findAll({ where: { code: { [op]: value } } })).length,
            ).toBeLessThanOrEqual(1);
          }
          const [row] = await Item.findAll({
            attributes: [
              [trigramSimilarity(col('code'), value), 'similarity'],
              [trigramWordSimilarity(value, col('code')), 'word'],
              [trigramDistance(col('code'), value), 'distance'],
            ],
            order: [[trigramDistance(col('code'), value), 'ASC']],
            raw: true,
          });
          expect(Object.keys(row ?? {})).toEqual(['similarity', 'word', 'distance']);
        }),
        propertyParameters(),
      );
    }));
});
