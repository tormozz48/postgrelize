import { describe, expect, it } from 'vitest';
import { PartitionDdl } from '../../../src/ddl/partition-ddl.ts';
import { PartitionBound } from '../../../src/ddl/partition-types.ts';

const partitions = new PartitionDdl();

describe('partition DDL', () => {
  it('renders PARTITION BY with columns and expressions', () => {
    expect(partitions.partitionBySql({ strategy: 'range', columns: ['at'] })).toBe(
      ' PARTITION BY RANGE ("at")',
    );
    expect(
      partitions.partitionBySql({
        strategy: 'list',
        columns: [{ name: 'region', collate: 'C' }, { expression: 'lower(kind)' }],
      }),
    ).toBe(' PARTITION BY LIST ("region" COLLATE "C", (lower(kind)))');
    expect(() => partitions.partitionBySql({ strategy: 'x' as never, columns: ['a'] })).toThrow(
      /partition strategy/,
    );
    expect(() => partitions.partitionBySql({ strategy: 'hash', columns: [] })).toThrow(
      /at least one column/,
    );
  });

  it('renders every bound form with literals', () => {
    const parent = { tableName: 'events', schema: 's' };
    expect(
      partitions.createPartitionSql(parent, 'e_2026', {
        from: ['2026-01-01', PartitionBound.MINVALUE],
        to: [new Date('2027-01-01T00:00:00Z'), PartitionBound.MAXVALUE],
      }),
    ).toBe(
      `CREATE TABLE "e_2026" PARTITION OF "s"."events" FOR VALUES FROM ('2026-01-01', MINVALUE) TO ('2027-01-01T00:00:00.000Z', MAXVALUE)`,
    );
    expect(partitions.boundSql({ in: ["it's", 3, null] })).toBe(`FOR VALUES IN ('it''s', 3, NULL)`);
    expect(partitions.boundSql({ modulus: 4, remainder: 1 })).toBe(
      'FOR VALUES WITH (MODULUS 4, REMAINDER 1)',
    );
    expect(partitions.boundSql({ default: true })).toBe('DEFAULT');
    expect(
      partitions.createPartitionSql(
        'p',
        'c',
        { default: true },
        { ifNotExists: true, partitionBy: { strategy: 'hash', columns: ['id'] } },
      ),
    ).toBe('CREATE TABLE IF NOT EXISTS "c" PARTITION OF "p" DEFAULT PARTITION BY HASH ("id")');
  });

  it('keeps string values that look like keywords as literals', () => {
    expect(partitions.boundSql({ in: ['MINVALUE'] })).toBe(`FOR VALUES IN ('MINVALUE')`);
  });

  it('rejects malformed bounds', () => {
    expect(() => partitions.boundSql({} as never)).toThrow(/Partition bound must be/);
    expect(() => partitions.boundSql({ in: [] })).toThrow(/at least one value/);
    expect(() => partitions.boundSql({ modulus: '4; DROP' as never, remainder: 0 })).toThrow(
      /whole number/,
    );
  });

  it('renders attach and detach', () => {
    expect(partitions.attachPartitionSql('p', 'c', { in: [1] })).toBe(
      'ALTER TABLE "p" ATTACH PARTITION "c" FOR VALUES IN (1)',
    );
    expect(partitions.detachPartitionSql('p', 'c')).toBe('ALTER TABLE "p" DETACH PARTITION "c"');
    expect(partitions.detachPartitionSql('p', 'c', { concurrently: true })).toBe(
      'ALTER TABLE "p" DETACH PARTITION "c" CONCURRENTLY',
    );
    expect(partitions.detachPartitionSql('p', 'c', { finalize: true })).toBe(
      'ALTER TABLE "p" DETACH PARTITION "c" FINALIZE',
    );
    expect(() =>
      partitions.detachPartitionSql('p', 'c', { concurrently: true, finalize: true }),
    ).toThrow(/cannot be combined/);
  });
});
