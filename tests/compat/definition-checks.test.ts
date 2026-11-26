import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

const outcome = (run: () => unknown): unknown => {
  try {
    run();
    return 'defined';
  } catch (error) {
    return (error as Error).message;
  }
};

describe('compat: errors while a model is defined', () => {
  it('rejects what v6 rejects and accepts a null unique', () =>
    expectSameResult('', async (lib, sequelize) => {
      const { STRING, INTEGER, ARRAY } = lib.DataTypes;
      const define = (name: string, attributes: object, options: object = {}): unknown =>
        outcome(() => sequelize.define(name, attributes as never, options as never));
      const auto = { type: INTEGER, primaryKey: true, autoIncrement: true };
      return [
        define('a', {
          foo: { type: STRING, unique: null },
          bar: { type: STRING, unique: undefined },
        }),
        define('b', { name: { type: undefined } }),
        define('c', { name: (lib.DataTypes as unknown as Record<string, unknown>)['NOPE'] }),
        define('d', { list: { type: ARRAY } }),
        define('e', { name: { type: STRING, validate: { notNull: true } } }),
        define('f', { name: { type: STRING, allowNull: false, validate: { notNull: true } } }),
        define('g', { x: auto, y: auto }),
        define('h', { field: INTEGER }, { validate: { field: () => {} } }),
        define('i', { field: INTEGER }, { validate: { other: 'no' } }),
      ];
    }));
});
