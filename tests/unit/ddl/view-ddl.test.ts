import { describe, expect, it } from 'vitest';
import { ViewDdl } from '../../../src/ddl/view-ddl.ts';

const views = new ViewDdl();

describe('view DDL', () => {
  it('renders create with every option', () => {
    expect(
      views.createSql({ tableName: 'v', schema: 's' }, ' SELECT 1 AS a; ', {
        replace: true,
        temporary: true,
        columns: ['a'],
        securityBarrier: true,
        securityInvoker: false,
        checkOption: 'cascaded',
      }),
    ).toBe(
      'CREATE OR REPLACE TEMPORARY VIEW "s"."v" ("a") WITH (security_barrier = true, security_invoker = false) AS SELECT 1 AS a WITH CASCADED CHECK OPTION',
    );
    expect(views.createSql('v', 'SELECT 1', {})).toBe('CREATE VIEW "v" AS SELECT 1');
    expect(views.createSql('v', 'SELECT 1', { recursive: true, columns: ['n'] })).toBe(
      'CREATE RECURSIVE VIEW "v" ("n") AS SELECT 1',
    );
  });

  it('renders materialized views, refresh and drop', () => {
    expect(
      views.createMaterializedSql('m', 'SELECT 1', {
        ifNotExists: true,
        columns: ['a'],
        using: 'heap',
        withData: false,
      }),
    ).toBe('CREATE MATERIALIZED VIEW IF NOT EXISTS "m" ("a") USING heap AS SELECT 1 WITH NO DATA');
    expect(views.createMaterializedSql('m', 'SELECT 1', {})).toBe(
      'CREATE MATERIALIZED VIEW "m" AS SELECT 1',
    );
    expect(views.refreshSql('m', { concurrently: true })).toBe(
      'REFRESH MATERIALIZED VIEW CONCURRENTLY "m"',
    );
    expect(views.refreshSql('m', { withData: false })).toBe(
      'REFRESH MATERIALIZED VIEW "m" WITH NO DATA',
    );
    expect(views.dropSql('v', false, { ifExists: true, cascade: true })).toBe(
      'DROP VIEW IF EXISTS "v" CASCADE',
    );
    expect(views.dropSql('m', true, {})).toBe('DROP MATERIALIZED VIEW "m"');
  });

  it('rejects bad input', () => {
    expect(() => views.createSql('v', '  ', {})).toThrow(/requires a query/);
    expect(() => views.createSql('v', undefined as never, {})).toThrow(/requires a query/);
    expect(() => views.createSql('v', 'SELECT 1', { recursive: true })).toThrow(/columns/);
    expect(() => views.createSql('v', 'SELECT 1', { checkOption: 'x' as never })).toThrow(
      /check option/,
    );
    expect(() => views.createSql('v', 'SELECT 1', { checkOption: 'toString' as never })).toThrow(
      /check option/,
    );
    expect(() => views.createMaterializedSql('m', 'SELECT 1', { using: 'heap; DROP' })).toThrow(
      /access method/,
    );
    expect(() => views.refreshSql('m', { concurrently: true, withData: false })).toThrow(
      /CONCURRENTLY/,
    );
  });
});
