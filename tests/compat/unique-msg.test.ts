import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

type Failure = Error & { errors: { path: string; message: string }[] };

describe('compat: custom unique messages', () => {
  it('uses msg of unique attributes, composite keys, not of indexes', () =>
    expectSameResult('', async (lib, sequelize) => {
      const text = lib.DataTypes.STRING;
      const Item = sequelize.define(
        'Item',
        {
          a: { type: text, unique: { msg: 'taken a' } as never },
          b: { type: text, unique: { name: 'bc', msg: 'taken pair' } },
          c: { type: text, unique: { name: 'bc', msg: 'taken pair' } },
          d: text,
        },
        { indexes: [{ unique: true, fields: ['d'], msg: 'taken d' } as never] },
      );
      await sequelize.sync();
      await Item.create({ a: '1', b: '1', c: '1', d: '1' } as never);
      const failure = async (values: object) => {
        const error = (await Item.create(values as never).catch((e: unknown) => e)) as Failure;
        return [error.message, error.errors.map((item) => [item.path, item.message])];
      };
      return [
        await failure({ a: '1' }),
        await failure({ b: '1', c: '1' }),
        await failure({ d: '1' }),
      ];
    }));

  it.each([
    ['the first', { name: 'ab', msg: 'taken ab' }, 'ab'],
    ['the second', 'ab', { name: 'ab', msg: 'taken ab' }],
  ])('uses the msg that %s attribute of a composite key declares', async (_name, a, b) => {
    await expectSameResult('', async (lib, sequelize) => {
      const Item = sequelize.define('Item', {
        a: { type: lib.DataTypes.STRING, unique: a as never },
        b: { type: lib.DataTypes.STRING, unique: b as never },
      });
      await sequelize.sync();
      await Item.create({ a: '1', b: '1' } as never);
      const error = (await Item.create({ a: '1', b: '1' } as never).catch(
        (e: unknown) => e,
      )) as Failure;
      return [error.message, error.errors.map((item) => [item.path, item.message])];
    });
  });
});
