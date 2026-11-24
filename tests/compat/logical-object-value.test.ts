import { describe, it } from 'vitest';
import { expectSameResult, type Lib } from '../support/compat.ts';
import type { Sequelize, WhereOptions } from '../../src/index.ts';

const TABLES = `
  CREATE TABLE "Es" (id SERIAL PRIMARY KEY, owner INTEGER, tag TEXT, "createdAt" TIMESTAMPTZ DEFAULT now(), "updatedAt" TIMESTAMPTZ DEFAULT now());
  INSERT INTO "Es" (id, owner, tag) VALUES (1,NULL,'a'),(2,5,'b'),(3,7,'c'),(4,6,'a'),(5,8,'b');
`;

const run = (
  scenario: (
    E: ReturnType<Sequelize['define']>,
    lib: Lib,
    sequelize: Sequelize,
  ) => Promise<unknown>,
) =>
  expectSameResult(TABLES, async (lib, sequelize) => {
    const E = sequelize.define('E', {
      owner: lib.DataTypes.INTEGER,
      tag: lib.DataTypes.STRING,
    });
    return scenario(E, lib, sequelize);
  });

const ids = async (E: ReturnType<Sequelize['define']>, where: WhereOptions): Promise<unknown[]> =>
  (await E.findAll({ where, order: [['id', 'ASC']] })).map((row) => row.get('id'));

describe('compat: Op.or / Op.and with an object value', () => {
  it('Op.or object joins the entries with OR', () =>
    run((E, { Op }) => ids(E, { owner: { [Op.or]: { [Op.is]: null, [Op.eq]: 5 } } })));

  it('Op.or array joins the entries with OR', () =>
    run((E, { Op }) => ids(E, { owner: { [Op.or]: [{ [Op.is]: null }, { [Op.eq]: 5 }] } })));

  it('Op.and object joins the entries with AND', () =>
    run((E, { Op }) => ids(E, { owner: { [Op.and]: { [Op.gt]: 5, [Op.lt]: 8 } } })));

  it('Op.and array joins the entries with AND', () =>
    run((E, { Op }) => ids(E, { owner: { [Op.and]: [{ [Op.gt]: 5 }, { [Op.lt]: 8 }] } })));

  it('Op.and nested inside Op.or', () =>
    run((E, { Op }) =>
      ids(E, {
        owner: {
          [Op.or]: { [Op.is]: null, [Op.and]: { [Op.gt]: 5, [Op.lt]: 8 } },
        },
      }),
    ));

  it('Op.or nested inside Op.and', () =>
    run((E, { Op }) =>
      ids(E, {
        owner: {
          [Op.and]: { [Op.not]: null, [Op.or]: { [Op.eq]: 5, [Op.gt]: 6 } },
        },
      }),
    ));

  it('Op.notIn with a literal inside the object form', () =>
    run((E, { Op, literal }) =>
      ids(E, {
        owner: { [Op.or]: { [Op.is]: null, [Op.notIn]: literal('(5, 6)') } },
      }),
    ));

  it('Op.notIn with a subquery literal inside the object form', () =>
    run((E, { Op, literal }) =>
      ids(E, {
        owner: {
          [Op.or]: {
            [Op.is]: null,
            [Op.notIn]: literal('(SELECT owner FROM "Es" WHERE tag = \'a\' AND owner IS NOT NULL)'),
          },
        },
      }),
    ));

  it('Op.or object with a plain array value (IN)', () =>
    run((E, { Op }) => ids(E, { tag: { [Op.or]: { [Op.eq]: 'a', [Op.in]: ['b'] } } })));

  it('top-level Op.or still works', () =>
    run((E, { Op }) => ids(E, { [Op.or]: { owner: 5, tag: 'a' } })));
});
