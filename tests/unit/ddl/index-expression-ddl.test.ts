import { describe, expect, it } from 'vitest';
import { IndexDdl } from '../../../src/ddl/index-ddl.ts';

const indexes = new IndexDdl();

describe('expression indexes', () => {
  it('renders expression fields with collation, operator class, order and nulls', () => {
    expect(
      indexes.createIndexSql('users', {
        name: 'users_lower_email',
        unique: true,
        fields: [{ expression: 'lower(email)', collate: 'C', operator: 'text_pattern_ops' }],
      }),
    ).toBe(
      'CREATE UNIQUE INDEX "users_lower_email" ON "users" ((lower(email)) COLLATE "C" text_pattern_ops)',
    );
    expect(
      indexes.createIndexSql(
        { tableName: 'users', schema: 's' },
        {
          name: 'i',
          using: 'btree',
          fields: [
            'a',
            { expression: 'a + b', order: 'DESC', nulls: 'FIRST' },
            { name: 'c', nulls: 'LAST' },
          ],
          include: ['d'],
          where: { active: true },
        },
      ),
    ).toBe(
      'CREATE INDEX "i" ON "s"."users" USING btree ("a", (a + b) DESC NULLS FIRST, "c" NULLS LAST) INCLUDE ("d") WHERE "active" = true',
    );
  });

  it('requires a name and a non-empty string expression', () => {
    expect(() => indexes.createIndexSql('t', { fields: [{ expression: 'lower(a)' }] })).toThrow(
      /requires an explicit name/,
    );
    expect(() => indexes.indexName('t', [{ expression: 'x' }])).toThrow(/explicit name/);
    expect(() => indexes.createIndexSql('t', { name: 'i', fields: [{ expression: ' ' }] })).toThrow(
      /non-empty SQL string/,
    );
  });

  it('keeps the default name for plain fields', () => {
    expect(indexes.indexName('users', ['email', { name: 'id' }])).toBe('users_email_id');
  });
});
