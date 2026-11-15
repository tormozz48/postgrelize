import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DataTypes, Sequelize } from '../../../src/index.ts';
import { testDatabaseUrl } from '../../support/db-url.ts';
import { PAYLOADS, propertyParameters, textValue, withCanary } from '../../support/injection.ts';

describe('statementCache keeps values bound', () => {
  it('round-trips payloads and arbitrary strings through named statements', () =>
    withCanary(async ({ schema }) => {
      const sequelize = new Sequelize(testDatabaseUrl(), {
        logging: false,
        statementCache: true,
        dialectOptions: { options: `-c search_path=${schema}` },
      });
      try {
        const Item = sequelize.define('Item', { code: DataTypes.TEXT }, { timestamps: false });
        await Item.sync();
        for (const payload of PAYLOADS) {
          await Item.create({ code: payload });
          expect((await Item.findAll({ where: { code: payload } })).length).toBeGreaterThan(0);
        }
        await fc.assert(
          fc.asyncProperty(textValue(), async (value) => {
            await Item.destroy({ where: {}, truncate: true });
            await Item.create({ code: value });
            expect(
              (await Item.findAll({ where: { code: value } })).map((row) => row.get('code')),
            ).toEqual([value]);
          }),
          propertyParameters(),
        );
      } finally {
        await sequelize.close();
      }
    }));

  it('rejects a non-integer max before connecting', () => {
    for (const max of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => new Sequelize(testDatabaseUrl(), { statementCache: { max } })).toThrow(
        /positive integer/,
      );
    }
  });
});
