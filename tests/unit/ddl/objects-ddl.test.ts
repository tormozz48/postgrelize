import { describe, expect, it } from 'vitest';
import { ExtensionDdl } from '../../../src/ddl/extension-ddl.ts';
import { SequenceDdl } from '../../../src/ddl/sequence-ddl.ts';

const extension = new ExtensionDdl();
const sequence = new SequenceDdl();

describe('extension DDL', () => {
  it('renders create and drop with quoted names and a literal version', () => {
    expect(extension.createSql('pg_trgm', {})).toBe('CREATE EXTENSION "pg_trgm"');
    expect(
      extension.createSql('my"ext', {
        ifNotExists: true,
        schema: 'ext',
        version: "1'0",
        cascade: true,
      }),
    ).toBe(`CREATE EXTENSION IF NOT EXISTS "my""ext" SCHEMA "ext" VERSION '1''0' CASCADE`);
    expect(extension.dropSql('pg_trgm', { ifExists: true, cascade: true })).toBe(
      'DROP EXTENSION IF EXISTS "pg_trgm" CASCADE',
    );
    expect(extension.dropSql('pg_trgm', {})).toBe('DROP EXTENSION "pg_trgm"');
  });
});

describe('sequence DDL', () => {
  it('renders create with every option', () => {
    expect(
      sequence.createSql(
        { tableName: 'seq', schema: 's' },
        {
          ifNotExists: true,
          dataType: 'bigint',
          increment: 2,
          minValue: 1,
          maxValue: 9_007_199_254_740_993n,
          start: 10,
          cache: 5,
          cycle: true,
          ownedBy: { table: 't', column: 'c' },
        },
      ),
    ).toBe(
      'CREATE SEQUENCE IF NOT EXISTS "s"."seq" AS bigint INCREMENT BY 2 MINVALUE 1 MAXVALUE 9007199254740993 START WITH 10 CACHE 5 CYCLE OWNED BY "t"."c"',
    );
    expect(sequence.createSql('plain', {})).toBe('CREATE SEQUENCE "plain"');
    expect(
      sequence.createSql('plain', {
        minValue: false,
        maxValue: false,
        cycle: false,
        ownedBy: null,
      }),
    ).toBe('CREATE SEQUENCE "plain" NO MINVALUE NO MAXVALUE NO CYCLE OWNED BY NONE');
  });

  it('renders alter and drop', () => {
    expect(sequence.alterSql('s', { ifExists: true, restartWith: 5, increment: -1 })).toBe(
      'ALTER SEQUENCE IF EXISTS "s" INCREMENT BY -1 RESTART WITH 5',
    );
    expect(sequence.alterSql('s', { restartWith: true })).toBe('ALTER SEQUENCE "s" RESTART');
    expect(sequence.dropSql('s', { ifExists: true, cascade: true })).toBe(
      'DROP SEQUENCE IF EXISTS "s" CASCADE',
    );
    expect(sequence.dropSql('s', {})).toBe('DROP SEQUENCE "s"');
  });

  it('rejects bad data types, non-integers and empty alters', () => {
    expect(() => sequence.createSql('s', { dataType: 'text' as never })).toThrow(/data type/);
    expect(() => sequence.createSql('s', { start: 1.5 })).toThrow(/whole number/);
    expect(() => sequence.createSql('s', { cache: '1; DROP TABLE x' as never })).toThrow(
      /whole number/,
    );
    expect(() => sequence.alterSql('s', {})).toThrow(/at least one/);
  });
});
