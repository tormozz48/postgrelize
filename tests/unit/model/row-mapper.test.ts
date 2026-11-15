import { describe, expect, it } from 'vitest';
import { DataTypes, Sequelize } from '../../../src/index.ts';
import { registry, rowMapper } from '../../../src/model/model-services.ts';

const Event = new Sequelize('postgres://unused@localhost:1/unused', { logging: false }).define(
  'Event',
  {
    title: DataTypes.TEXT,
    seenAt: { type: DataTypes.DATE, field: 'seen_at' },
    at: DataTypes.DATE,
  },
  { timestamps: false },
);
const definition = registry.definition(Event);
const stamp = '2024-01-02T03:04:05.000Z';
const make = () => ({ id: 1, at: stamp, seen_at: stamp, title: 't', extra: 1 });

describe('RowMapper.parse', () => {
  it('maps columns to attributes, parses values and keeps unknown columns', () => {
    const parsed = rowMapper.parse(definition, {
      id: 1,
      title: 't',
      seen_at: stamp,
      at: null,
      extra: 'x',
    });
    expect(parsed).toEqual({ id: 1, title: 't', seenAt: new Date(stamp), at: null, extra: 'x' });
  });

  it('does not touch the driver row', () => {
    const row = { id: 1, seen_at: stamp };
    rowMapper.parse(definition, row);
    expect(row).toEqual({ id: 1, seen_at: stamp });
  });

  it('keeps a column named __proto__ as an own property', () => {
    const row = JSON.parse('{"__proto__": 7, "title": "t"}') as Record<string, unknown>;
    const parsed = rowMapper.parse(definition, row);
    expect(Object.keys(parsed)).toEqual(['__proto__', 'title']);
    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
  });
});

describe('RowMapper.parseOwned', () => {
  it('parses in place when no column is renamed', () => {
    const row = { id: 1, at: stamp, title: 't' };
    const parsed = rowMapper.parseOwned(definition, row);
    expect(parsed).toBe(row);
    expect(parsed).toEqual({ id: 1, at: new Date(stamp), title: 't' });
  });

  it('matches parse, including key order, when a column is renamed', () => {
    const owned = rowMapper.parseOwned(definition, make());
    const copied = rowMapper.parse(definition, make());
    expect(owned).toEqual(copied);
    expect(Object.keys(owned)).toEqual(Object.keys(copied));
  });
});
