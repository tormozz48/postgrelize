import { describe, expect, it } from 'vitest';
import { SqlAst, type FromItem, type SelectNode } from '../../../src/sql/ast.ts';
import { SqlCompiler } from '../../../src/sql/compile.ts';

const ast = new SqlAst();
const compiler = new SqlCompiler();

const from = (item: FromItem, extra: Partial<SelectNode> = {}) =>
  compiler.compile({ kind: 'select', columns: [{ kind: 'star' }], from: item, ...extra });

describe('FROM sources', () => {
  it('renders VALUES with bound cells and column aliases', () => {
    const compiled = from({
      values: [
        [ast.param(1), ast.param('a')],
        [ast.param(2), ast.param('b')],
      ],
      alias: 'v',
      columns: ['id', 'label'],
    });
    expect(compiled.text).toBe('SELECT * FROM (VALUES ($1, $2), ($3, $4)) AS "v"("id", "label")');
    expect(compiled.values).toEqual([1, 'a', 2, 'b']);
  });

  it('renders set-returning functions with and without ordinality', () => {
    expect(
      from({ function: ['generate_series'], args: [ast.param(1), ast.param(3)], alias: 'g' }).text,
    ).toBe('SELECT * FROM "generate_series"($1, $2) AS "g"');
    expect(
      from({
        function: ['pg_catalog', 'unnest'],
        args: [ast.param([1])],
        alias: 'u',
        columns: ['x', 'ord'],
        ordinality: 'ord',
      }).text,
    ).toBe('SELECT * FROM "pg_catalog"."unnest"($1) WITH ORDINALITY AS "u"("x", "ord")');
  });

  it('renders JSON_TABLE columns', () => {
    const compiled = from({
      jsonTable: {
        doc: ast.param('{}'),
        path: "'$[*]'",
        columns: [
          { name: 'n', kind: 'ordinality' },
          { name: 'a', kind: 'value', type: 'int', path: "'$.a'" },
          { name: 'ok', kind: 'exists', type: 'boolean', path: "'$.b'" },
          { name: 'c', kind: 'value', type: 'text' },
        ],
      },
      alias: 'j',
    });
    expect(compiled.text).toBe(
      `SELECT * FROM JSON_TABLE($1, '$[*]' COLUMNS ("n" FOR ORDINALITY, "a" int PATH '$.a', "ok" boolean EXISTS PATH '$.b', "c" text)) AS "j"`,
    );
  });

  it('renders LATERAL subqueries and TABLESAMPLE', () => {
    const inner: SelectNode = { kind: 'select', columns: [ast.raw('1')], from: { name: 't' } };
    expect(from({ subquery: inner, alias: 'l', lateral: true }).text).toBe(
      'SELECT * FROM LATERAL (SELECT 1 FROM "t") AS "l"',
    );
    const sampled = from({
      name: 'posts',
      alias: 'p',
      sample: { method: 'BERNOULLI', percent: ast.param(10), seed: ast.param(42) },
    });
    expect(sampled.text).toBe(
      'SELECT * FROM "posts" AS "p" TABLESAMPLE BERNOULLI ($1) REPEATABLE ($2)',
    );
    expect(sampled.values).toEqual([10, 42]);
    expect(from({ name: 'posts', sample: { method: 'SYSTEM', percent: ast.param(1) } }).text).toBe(
      'SELECT * FROM "posts" TABLESAMPLE SYSTEM ($1)',
    );
  });

  it('renders sources next to the main table and in joins', () => {
    const compiled = from(
      { name: 'a' },
      {
        extraFrom: [{ function: ['generate_series'], args: [ast.param(1)], alias: 'g' }],
      },
    );
    expect(compiled.text).toBe('SELECT * FROM "a", "generate_series"($1) AS "g"');
  });
});
