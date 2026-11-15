import { describe, expect, it } from 'vitest';
import { ColumnDescriber } from '../../../src/query-interface/column-describer.ts';

const describer = new ColumnDescriber();

const describeOne = (row: Record<string, unknown>) =>
  describer.describe([{ Field: 'c', Type: 'text', Null: 'YES', Default: null, ...row }])['c']!;

describe('ColumnDescriber', () => {
  it('maps catalog rows to v6 column descriptions', () => {
    expect(
      describeOne({
        Type: 'character varying(255)',
        Null: 'NO',
        Constraint: 'PRIMARY KEY',
        Comment: 'note',
      }),
    ).toEqual({
      type: 'CHARACTER VARYING(255)',
      allowNull: false,
      defaultValue: null,
      comment: 'note',
      special: [],
      primaryKey: true,
    });
    expect(describeOne({ Comment: undefined }).comment).toBeNull();
    expect(describeOne({ Constraint: 'UNIQUE' }).primaryKey).toBe(false);
  });

  it('parses enum labels from arrays and from PostgreSQL array literals', () => {
    expect(describeOne({ special: ['a', 'b'] }).special).toEqual(['a', 'b']);
    expect(describeOne({ special: '{a,"b c",d}' }).special).toEqual(['a', 'b c', 'd']);
    expect(describeOne({ special: '{}' }).special).toEqual([]);
    expect(describeOne({ special: 'not an array' }).special).toEqual([]);
    expect(describeOne({ special: null }).special).toEqual([]);
  });

  it('cleans defaults', () => {
    expect(describeOne({ Type: 'boolean', Default: 'true' }).defaultValue).toBe(true);
    expect(describeOne({ Type: 'boolean', Default: 'false' }).defaultValue).toBe(false);
    expect(describeOne({ Type: 'boolean', Default: 'nextval' }).defaultValue).toBeNull();
    expect(describeOne({ Default: 5 }).defaultValue).toBe(5);
    expect(describeOne({ Default: "'it''s'::text" }).defaultValue).toBe("it's");
    expect(describeOne({ Default: "'x'" }).defaultValue).toBe('x');
    expect(describeOne({ Default: 'now()' }).defaultValue).toBe('now()');
    expect(describeOne({ Default: '(1 + 2)::integer' }).defaultValue).toBe('(1 + 2)');
    expect(describeOne({ Default: "nextval('seq'::regclass)" }).defaultValue).toBe(
      'nextval(seq::regclass)',
    );
  });
});
