import { describe, expect, it } from 'vitest';
import { ConstraintDdl } from '../../../src/ddl/constraint-ddl.ts';

const constraints = new ConstraintDdl();

describe('PostgreSQL 18 constraint forms', () => {
  it('renders WITHOUT OVERLAPS on the last key field', () => {
    expect(
      constraints.addConstraintSql('rooms', {
        type: 'primary key',
        fields: ['id', 'valid_at'],
        name: 'rooms_pk',
        withoutOverlaps: true,
      }),
    ).toBe(
      'ALTER TABLE "rooms" ADD CONSTRAINT "rooms_pk" PRIMARY KEY ("id", "valid_at" WITHOUT OVERLAPS)',
    );
    expect(
      constraints.addConstraintSql('rooms', {
        type: 'unique',
        fields: ['valid_at'],
        name: 'u',
        withoutOverlaps: true,
        nullsNotDistinct: true,
      }),
    ).toBe(
      'ALTER TABLE "rooms" ADD CONSTRAINT "u" UNIQUE NULLS NOT DISTINCT ("valid_at" WITHOUT OVERLAPS)',
    );
  });

  it('renders PERIOD foreign keys with referenced fields', () => {
    expect(
      constraints.addConstraintSql('stays', {
        type: 'foreign key',
        fields: ['room_id', 'during'],
        name: 'stays_room_fk',
        period: true,
        references: { table: 'rooms', field: 'id', fields: ['id', 'valid_at'] },
      }),
    ).toBe(
      'ALTER TABLE "stays" ADD CONSTRAINT "stays_room_fk" FOREIGN KEY ("room_id", PERIOD "during") REFERENCES "rooms" ("id", PERIOD "valid_at")',
    );
  });

  it('renders NOT ENFORCED before NOT VALID', () => {
    expect(
      constraints.addConstraintSql('p', {
        type: 'check',
        fields: ['a'],
        name: 'c',
        where: { a: 1 },
        enforced: false,
      }),
    ).toBe('ALTER TABLE "p" ADD CONSTRAINT "c" CHECK ("a" = 1) NOT ENFORCED');
    expect(
      constraints.addConstraintSql('p', {
        type: 'check',
        fields: ['a'],
        name: 'c',
        where: { a: 1 },
        enforced: true,
        notValid: true,
      }),
    ).toBe('ALTER TABLE "p" ADD CONSTRAINT "c" CHECK ("a" = 1) NOT VALID');
  });

  it('rejects options on the wrong constraint type or without fields', () => {
    expect(() =>
      constraints.addConstraintSql('p', { type: 'unique', fields: ['a'], enforced: false }),
    ).toThrow(/check and foreign key/);
    expect(() =>
      constraints.addConstraintSql('p', { type: 'check', fields: ['a'], withoutOverlaps: true }),
    ).toThrow(/withoutOverlaps applies to unique and primary key/);
    expect(() =>
      constraints.addConstraintSql('p', { type: 'unique', fields: ['a'], period: true }),
    ).toThrow(/period applies to foreign key/);
    expect(() =>
      constraints.addConstraintSql('p', { type: 'unique', name: 'n', withoutOverlaps: true }),
    ).toThrow(/at least one field/);
  });
});
