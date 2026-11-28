import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import {
  DataTypes,
  arrayAgg,
  arraySlice,
  grouping,
  rollup,
  stringAgg,
  type Sequelize,
} from '../../../src/index.ts';
import {
  PAYLOADS,
  identifier,
  propertyParameters,
  settle,
  textValue,
  withCanary,
} from '../../support/injection.ts';

type Row = Record<string, unknown>;

const defineNote = async (sequelize: Sequelize) => {
  const Note = sequelize.define('Note', { body: DataTypes.TEXT }, { timestamps: false });
  await Note.sync();
  await Note.bulkCreate([{ body: 'a' }, { body: 'b' }]);
  return Note;
};

describe('payloads in aggregates and grouping', () => {
  it('writes the string_agg separator as one escaped literal', () =>
    withCanary(async ({ sequelize }) => {
      const Note = await defineNote(sequelize);
      const check = async (separator: string) => {
        const rows = (await Note.findAll({
          attributes: [[stringAgg('body', separator, { orderBy: ['body'] }), 'joined']],
          raw: true,
        })) as unknown as Row[];
        expect(rows[0]?.['joined']).toBe(`a${separator}b`);
      };
      for (const payload of PAYLOADS) {
        await check(payload);
      }
      await fc.assert(fc.asyncProperty(textValue(), check), propertyParameters());
    }));

  it('quotes attribute names of aggregates, ORDER BY and grouping clauses', () =>
    withCanary(async ({ sequelize }) => {
      const Note = await defineNote(sequelize);
      await fc.assert(
        fc.asyncProperty(identifier(), async (name) => {
          fc.pre(!name.includes('.') && !name.includes('::') && !name.startsWith('$'));
          const queries = [
            { attributes: [[arrayAgg(name), 'x']] },
            { attributes: [[arrayAgg('id', { orderBy: [name] }), 'x']] },
            { attributes: [[grouping(name), 'x']], group: [rollup([name])] },
          ];
          for (const query of queries) {
            await settle(Note.findAll(query as never));
          }
        }),
        propertyParameters(),
      );
      expect(await Note.count()).toBe(2);
    }));

  it('rejects directions and slice bounds that are not on the allowlist', () =>
    withCanary(async ({ sequelize }) => {
      const Note = await defineNote(sequelize);
      for (const payload of PAYLOADS) {
        const outcome = await settle(
          Note.findAll({ attributes: [[arrayAgg('id', { orderBy: [['id', payload]] }), 'x']] }),
        );
        expect(outcome).toBeInstanceOf(Error);
        expect(() => arraySlice(arrayAgg('id'), payload as never)).toThrow('slice bound');
        expect(() => arraySlice(arrayAgg('id'), 1, payload as never)).toThrow('slice bound');
      }
    }));
});
