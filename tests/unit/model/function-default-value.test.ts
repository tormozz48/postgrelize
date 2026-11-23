import { expect, it } from 'vitest';
import { DataTypes, Sequelize } from '../../../src/index.ts';

it('calls a function defaultValue once per built instance', () => {
  const sequelize = new Sequelize('postgres://unused@localhost:1/unused', { logging: false });
  let calls = 0;
  const Item = sequelize.define(
    'Item',
    { color: { type: DataTypes.STRING, defaultValue: () => `#${++calls}` } },
    { timestamps: false },
  );
  expect([Item.build({}).get('color'), Item.build({}).get('color')]).toEqual(['#1', '#2']);
  expect(Item.build({ color: 'red' }).get('color')).toBe('red');
});
