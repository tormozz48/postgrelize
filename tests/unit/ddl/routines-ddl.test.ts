import { describe, expect, it } from 'vitest';
import { FunctionDdl } from '../../../src/ddl/function-ddl.ts';
import { RoutineGuards } from '../../../src/ddl/routine-guards.ts';
import { TriggerDdl, type TriggerSpec } from '../../../src/ddl/trigger-ddl.ts';

const functions = new FunctionDdl();
const triggers = new TriggerDdl();
const guards = new RoutineGuards();

const create = (overrides: {
  name?: string;
  type?: string;
  language?: string;
  options?: string[];
  param?: string;
}) =>
  functions.createSql(
    overrides.name ?? 'f',
    [{ type: overrides.type ?? 'integer', name: overrides.param }],
    'integer',
    overrides.language ?? 'plpgsql',
    'x',
    overrides.options ?? [],
    {},
  );

describe('function DDL', () => {
  it('renders the v6 statement shape', () => {
    expect(
      functions.createSql(
        'f',
        [{ type: 'integer', name: 'a', direction: 'in' }, { type: 'varchar(10)' }],
        'SETOF text',
        'plpgsql',
        'RETURN a;',
        ['immutable', 'parallel   safe', 'cost 5'],
        {
          force: true,
          variables: [
            { name: 'x', type: 'text', default: "it's" },
            { name: 'y', type: 'int[]' },
          ],
        },
      ),
    ).toBe(
      "CREATE OR REPLACE FUNCTION f(IN a integer, varchar(10)) RETURNS SETOF text AS $func$ DECLARE x text := 'it''s'; DECLARE y int[]; BEGIN RETURN a; END; $func$ LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE COST 5",
    );
  });

  it('picks a dollar tag the body does not contain and quotes object names', () => {
    expect(
      functions.createSql(
        { name: 'My Fn', schema: 's' },
        [],
        'trigger',
        'plpgsql',
        'x $func$ y $func1$',
        [],
        {},
      ),
    ).toBe(
      'CREATE FUNCTION "s"."My Fn"() RETURNS trigger AS $func2$  BEGIN x $func$ y $func1$ END; $func2$ LANGUAGE plpgsql',
    );
  });

  it('renders drop and rename', () => {
    expect(
      functions.dropSql('app.f', [{ type: 'integer' }], { ifExists: true, cascade: true }),
    ).toBe('DROP FUNCTION IF EXISTS app.f(integer) CASCADE');
    expect(functions.dropSql('f', [], {})).toBe('DROP FUNCTION f() RESTRICT');
    expect(functions.renameSql('f', [], 'g')).toBe('ALTER FUNCTION f() RENAME TO g');
  });

  it('rejects anything outside the guards', () => {
    expect(() => create({ name: 'f; DROP' })).toThrow(/function name/);
    expect(() => create({ type: 'integer); DROP TABLE x; --' })).toThrow(/parameter type/);
    expect(() => create({ type: 'text $$' })).toThrow(/parameter type/);
    expect(() => create({ language: "plpgsql' AS" })).toThrow(/language/);
    expect(() => create({ options: ['IMMUTABLE; DROP'] })).toThrow(/function option/);
    expect(() => create({ param: 'a b' })).toThrow(/parameter name/);
    expect(() => functions.createSql('f', [], '', 'plpgsql', 'x', [], {})).toThrow(/requires/);
    expect(() =>
      functions.createSql('f', [{ type: 'int', direction: 'sideways' }], 'int', 'sql', 'x', [], {}),
    ).toThrow(/direction/);
    expect(() => functions.dropSql('f', undefined as never, {})).toThrow(/array/);
  });
});

describe('trigger DDL', () => {
  const spec: TriggerSpec = {
    table: { tableName: 'posts', schema: 's' },
    name: 't"x',
    timing: 'before',
    events: ['insert', 'update'],
    functionName: 'bump',
    functionArgs: ["it's", 3, true],
    optionsArray: ['for each row', 'WHEN (OLD.a IS DISTINCT FROM NEW.a)'],
  };

  it('renders create with literal arguments', () => {
    expect(triggers.createSql(spec, { replace: true })).toBe(
      `CREATE OR REPLACE TRIGGER "t""x" BEFORE INSERT OR UPDATE ON "s"."posts" FOR EACH ROW WHEN (OLD.a IS DISTINCT FROM NEW.a) EXECUTE FUNCTION bump('it''s', 3, true)`,
    );
    expect(
      triggers.createSql(
        {
          ...spec,
          timing: 'after_constraint',
          events: ['delete'],
          optionsArray: ['DEFERRABLE', 'initially deferred'],
          functionArgs: [],
        },
        {},
      ),
    ).toBe(
      'CREATE CONSTRAINT TRIGGER "t""x" AFTER DELETE ON "s"."posts" DEFERRABLE INITIALLY DEFERRED EXECUTE FUNCTION bump()',
    );
    expect(
      triggers.createSql(
        {
          ...spec,
          timing: 'instead_of',
          optionsArray: ['REFERENCING NEW TABLE AS n OLD TABLE AS o'],
        },
        {},
      ),
    ).toContain(
      'INSTEAD OF INSERT OR UPDATE ON "s"."posts" REFERENCING NEW TABLE AS N OLD TABLE AS O',
    );
  });

  it('renders drop and rename', () => {
    expect(triggers.dropSql('posts', 't', { ifExists: true, cascade: true })).toBe(
      'DROP TRIGGER IF EXISTS "t" ON "posts" CASCADE',
    );
    expect(triggers.dropSql('posts', 't', {})).toBe('DROP TRIGGER "t" ON "posts" RESTRICT');
    expect(triggers.renameSql('posts', 'a', 'b')).toBe(
      'ALTER TRIGGER "a" ON "posts" RENAME TO "b"',
    );
  });

  it('rejects bad timings, events, clauses and arguments', () => {
    expect(() => triggers.createSql({ ...spec, timing: 'sometime' as never }, {})).toThrow(
      /Invalid trigger event/,
    );
    expect(() => triggers.createSql({ ...spec, timing: '__proto__' as never }, {})).toThrow(
      /Invalid trigger event/,
    );
    expect(() => triggers.createSql({ ...spec, events: [] }, {})).toThrow(/no table change events/);
    expect(() => triggers.createSql({ ...spec, events: ['bogus' as never] }, {})).toThrow(
      /undefined trigger event/,
    );
    expect(() => triggers.createSql({ ...spec, optionsArray: ['FOR EACH ROW; DROP'] }, {})).toThrow(
      /trigger option/,
    );
    expect(() =>
      triggers.createSql({ ...spec, functionArgs: [{ type: 'x' } as never] }, {}),
    ).toThrow(/arguments must be/);
    expect(() => triggers.createSql({ ...spec, functionArgs: undefined as never }, {})).toThrow(
      /array required/,
    );
  });
});

describe('routine guards', () => {
  it('accepts common types and rejects statement fragments', () => {
    for (const type of [
      'integer',
      'double precision',
      'timestamp with time zone',
      'numeric(10, 2)',
      'text[]',
      'public.my_type',
      'SETOF users',
      'character varying(5)[]',
    ]) {
      expect(guards.typeName(type, 'type')).toBe(type);
    }
    for (const type of ['int;', "int'", 'int--', 'int/*', '', 'a.b.c', 'int()']) {
      expect(() => guards.typeName(type, 'type')).toThrow(/./);
    }
    expect(() => guards.typeName(5 as never, 'type')).toThrow(/./);
  });
});
