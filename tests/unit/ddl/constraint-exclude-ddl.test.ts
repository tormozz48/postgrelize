import { describe, expect, it } from 'vitest';
import { Deferrable } from '../../../src/ddl/ddl-types.ts';
import { ConstraintDdl } from '../../../src/ddl/constraint-ddl.ts';
import { DdlGuards } from '../../../src/ddl/ddl-guards.ts';

const constraints = new ConstraintDdl();

describe('EXCLUDE constraints', () => {
  it('renders elements, method, include, predicate and deferrable mode', () => {
    expect(
      constraints.addConstraintSql(
        { tableName: 'bookings', schema: 's' },
        {
          type: 'exclude',
          name: 'no_overlap',
          using: 'gist',
          exclude: [
            { name: 'room', with: '=' },
            { expression: 'tstzrange(starts, ends)', with: '&&', order: 'DESC' },
          ],
          include: ['note'],
          where: { active: true },
          deferrable: Deferrable.INITIALLY_DEFERRED,
        },
      ),
    ).toBe(
      'ALTER TABLE "s"."bookings" ADD CONSTRAINT "no_overlap" EXCLUDE USING gist ("room" WITH =, (tstzrange(starts, ends)) DESC WITH &&) INCLUDE ("note") WHERE ("active" = true) DEFERRABLE INITIALLY DEFERRED',
    );
  });

  it('derives a default name from column elements', () => {
    expect(
      constraints.addConstraintSql('b', {
        type: 'EXCLUDE',
        exclude: [{ name: 'room', with: '=' }],
      }),
    ).toBe('ALTER TABLE "b" ADD CONSTRAINT "b_room_excl" EXCLUDE ("room" WITH =)');
  });

  it('rejects missing elements, nameless expressions and bad operators', () => {
    expect(() => constraints.addConstraintSql('b', { type: 'exclude', name: 'n' })).toThrow(
      /requires exclude elements/,
    );
    expect(() =>
      constraints.addConstraintSql('b', {
        type: 'exclude',
        exclude: [{ expression: 'x', with: '=' }],
      }),
    ).toThrow(/explicit name/);
    for (const operator of ['', '= ; DROP', '=--', '/*', 'a', '='.repeat(64), '&& )']) {
      expect(() =>
        constraints.addConstraintSql('b', {
          type: 'exclude',
          name: 'n',
          exclude: [{ name: 'a', with: operator }],
        }),
      ).toThrow(/Invalid operator/);
    }
    expect(new DdlGuards().operator('-|-')).toBe('-|-');
  });
});

describe('NOT VALID and VALIDATE CONSTRAINT', () => {
  it('appends NOT VALID to check and foreign key constraints only', () => {
    expect(
      constraints.addConstraintSql('p', {
        type: 'check',
        fields: ['price'],
        name: 'c',
        where: { price: { gt: 0 } },
        notValid: true,
      }),
    ).toMatch(/NOT VALID$/);
    expect(
      constraints.addConstraintSql('p', {
        type: 'foreign key',
        fields: ['u'],
        name: 'f',
        references: { table: 'users', field: 'id' },
        deferrable: Deferrable.NOT,
        notValid: true,
      }),
    ).toBe(
      'ALTER TABLE "p" ADD CONSTRAINT "f" FOREIGN KEY ("u") REFERENCES "users" ("id") NOT DEFERRABLE NOT VALID',
    );
    expect(() =>
      constraints.addConstraintSql('p', { type: 'unique', fields: ['a'], notValid: true }),
    ).toThrow(/notValid/);
  });

  it('renders VALIDATE CONSTRAINT', () => {
    expect(constraints.validateConstraintSql({ tableName: 't', schema: 's' }, 'c"x')).toBe(
      'ALTER TABLE "s"."t" VALIDATE CONSTRAINT "c""x"',
    );
  });
});
