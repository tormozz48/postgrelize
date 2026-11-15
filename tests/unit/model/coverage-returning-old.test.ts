import { describe, expect, it } from 'vitest';
import { DataTypes, Sequelize } from '../../../src/index.ts';
import {
  registry,
  returningOld,
  rowMapper,
  writtenRows,
} from '../../../src/model/model-services.ts';

const Stock = new Sequelize('postgres://unused@localhost:1/unused', { logging: false }).define(
  'Stock',
  {
    sku: { type: DataTypes.TEXT, field: 'stock_sku' },
    seenAt: { type: DataTypes.DATE, field: 'seen_at' },
    label: { type: DataTypes.VIRTUAL },
  },
  { timestamps: false },
);
const definition = registry.definition(Stock);

const runtime = (version: number) => ({ serverVersion: () => Promise.resolve(version) });

describe('ReturningOld.enabled', () => {
  it('is off unless requested, without asking the server', async () => {
    const asked: string[] = [];
    const spy = {
      serverVersion: () => {
        asked.push('version');
        return Promise.resolve(0);
      },
    };
    expect(await returningOld.enabled(spy, {})).toBe(false);
    expect(await returningOld.enabled(spy, { returningOld: false })).toBe(false);
    expect(asked).toEqual([]);
  });

  it('requires PostgreSQL 18', async () => {
    await expect(returningOld.enabled(runtime(170005), { returningOld: true })).rejects.toThrow(
      'returningOld requires PostgreSQL 18 or newer',
    );
    expect(await returningOld.enabled(runtime(180000), { returningOld: true })).toBe(true);
  });
});

describe('ReturningOld.node', () => {
  it('appends the stored columns of the old row to RETURNING, skipping virtual attributes', () => {
    const node = returningOld.node(definition, {
      returning: [{ kind: 'ident', path: ['id'] }],
    }) as unknown as { returning: unknown; returningOld: string };
    expect(node.returningOld).toBe('__pgz_old');
    expect(node.returning).toEqual([
      { kind: 'ident', path: ['id'] },
      { kind: 'alias', expr: { kind: 'ident', path: ['__pgz_old', 'id'] }, alias: '__pgz_old.id' },
      {
        kind: 'alias',
        expr: { kind: 'ident', path: ['__pgz_old', 'stock_sku'] },
        alias: '__pgz_old.sku',
      },
      {
        kind: 'alias',
        expr: { kind: 'ident', path: ['__pgz_old', 'seen_at'] },
        alias: '__pgz_old.seenAt',
      },
    ]);
  });

  it('starts the RETURNING list when the node has none', () => {
    expect((returningOld.node(definition, {}) as { returning?: unknown[] }).returning).toHaveLength(
      3,
    );
  });
});

describe('ReturningOld.previous', () => {
  it('returns null when the old primary key is empty (the row was inserted)', () => {
    expect(
      returningOld.previous(definition, { id: 1, '__pgz_old.id': null, '__pgz_old.sku': null }),
    ).toBeNull();
    expect(returningOld.previous(definition, { id: 1 })).toBeNull();
  });

  it('parses the old values with the attribute types', () => {
    const old = returningOld.previous(definition, {
      id: 1,
      sku: 'new',
      '__pgz_old.id': 1,
      '__pgz_old.sku': 'old',
      '__pgz_old.seenAt': '2026-01-01T00:00:00.000Z',
    });
    expect(old).toEqual({ id: 1, sku: 'old', seenAt: new Date('2026-01-01T00:00:00.000Z') });
  });
});

describe('WrittenRows.instance', () => {
  const row = {
    id: 1,
    sku: 'new',
    '__pgz_old.id': 1,
    '__pgz_old.sku': 'old',
    __pgz_inserted: false,
  };

  it('records the pre-statement values as oldValues', () => {
    const instance = writtenRows.instance(Stock, row, true);
    expect(instance.get('sku')).toBe('new');
    expect(instance.oldValues).toEqual({ id: 1, sku: 'old' });
    expect(instance.isNewRecord).toBe(false);
  });

  it('leaves oldValues undefined when the old row was not requested', () => {
    const instance = writtenRows.instance(Stock, row, false);
    expect(instance.oldValues).toBeUndefined();
    expect(Object.keys(instance.dataValues)).toEqual(['id', 'sku']);
  });

  it('reports null oldValues for an inserted row', () => {
    const instance = writtenRows.instance(Stock, { id: 2, sku: 'x', '__pgz_old.id': null }, true);
    expect(instance.oldValues).toBeNull();
  });
});

describe('RowMapper.aggregate', () => {
  it('passes empty aggregates through and converts numbers', () => {
    const attribute = definition.attributes.get('seenAt');
    expect(rowMapper.aggregate(attribute, 'max', null)).toBeNull();
    expect(rowMapper.aggregate(attribute, 'max', undefined)).toBeUndefined();
    expect(rowMapper.aggregate(undefined, 'count', '3')).toBe(3);
    expect(rowMapper.aggregate(attribute, 'max', '2026-01-01T00:00:00.000Z')).toEqual(
      new Date('2026-01-01T00:00:00.000Z'),
    );
  });
});
