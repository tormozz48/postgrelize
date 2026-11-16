import { describe, expect, it } from 'vitest';
import { PolicyDdl } from '../../../src/ddl/policy-ddl.ts';

const policies = new PolicyDdl();

describe('policy DDL', () => {
  it('renders enable, disable and drop', () => {
    expect(policies.enableSql({ tableName: 't', schema: 's' }, { force: true })).toBe(
      'ALTER TABLE "s"."t" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY',
    );
    expect(policies.enableSql('t', {})).toBe('ALTER TABLE "t" ENABLE ROW LEVEL SECURITY');
    expect(policies.disableSql('t', { noForce: true })).toBe(
      'ALTER TABLE "t" DISABLE ROW LEVEL SECURITY, NO FORCE ROW LEVEL SECURITY',
    );
    expect(policies.disableSql('t', {})).toBe('ALTER TABLE "t" DISABLE ROW LEVEL SECURITY');
    expect(policies.dropSql('t', 'p', { ifExists: true, cascade: true })).toBe(
      'DROP POLICY IF EXISTS "p" ON "t" CASCADE',
    );
    expect(policies.dropSql('t', 'p', {})).toBe('DROP POLICY "p" ON "t"');
  });

  it('renders create with roles and string or object conditions', () => {
    expect(
      policies.createSql('t', 'p"x', {
        kind: 'restrictive',
        command: 'update',
        roles: ['app user', 'PUBLIC', 'current_user'],
        using: 'owner = current_user',
        withCheck: { tenant: 7, label: "it's" },
      }),
    ).toBe(
      `CREATE POLICY "p""x" ON "t" AS RESTRICTIVE FOR UPDATE TO "app user", PUBLIC, CURRENT_USER USING (owner = current_user) WITH CHECK (("tenant" = 7 AND "label" = 'it''s'))`,
    );
    expect(policies.createSql('t', 'p', {})).toBe('CREATE POLICY "p" ON "t"');
  });

  it('renders alter with a rename last', () => {
    expect(policies.alterSql('t', 'a', { roles: ['r'], using: 'true', rename: 'b' })).toEqual([
      'ALTER POLICY "a" ON "t" TO "r" USING (true)',
      'ALTER POLICY "a" ON "t" RENAME TO "b"',
    ]);
    expect(policies.alterSql('t', 'a', { rename: 'b' })).toEqual([
      'ALTER POLICY "a" ON "t" RENAME TO "b"',
    ]);
  });

  it('rejects bad input', () => {
    expect(() => policies.createSql('t', 'p', { command: 'x' as never })).toThrow(/command/);
    expect(() => policies.createSql('t', 'p', { command: '__proto__' as never })).toThrow(
      /command/,
    );
    expect(() => policies.createSql('t', 'p', { kind: 'x' as never })).toThrow(/kind/);
    expect(() => policies.createSql('t', 'p', { roles: [] })).toThrow(/roles/);
    expect(() => policies.createSql('t', 'p', { using: ' ' })).toThrow(/condition/);
    expect(() => policies.alterSql('t', 'p', {})).toThrow(/at least one/);
  });
});
