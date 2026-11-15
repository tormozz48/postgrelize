import { describe, expect, it } from 'vitest';
import { SqlAst, type ExprNode, type MergeNode, type StatementNode } from '../../../src/sql/ast.ts';
import { SqlCompiler } from '../../../src/sql/compile.ts';

const ast = new SqlAst();
const compiler = new SqlCompiler();

const mergeWith = (action: unknown): MergeNode => ({
  kind: 'merge',
  table: { name: 'items' },
  source: { kind: 'values', alias: 's', columns: ['id'], rows: [[ast.param(1)]] },
  on: ast.binary('=', ast.ident('items', 'id'), ast.ident('s', 'id')),
  when: [{ match: 'MATCHED', action } as never],
});

describe('exhaustiveness guards', () => {
  it('rejects an unknown statement node', () => {
    expect(() => compiler.compile({ kind: 'bogus' } as unknown as StatementNode)).toThrow(
      'Unexpected AST node: {"kind":"bogus"}',
    );
  });

  it('rejects an unknown expression node', () => {
    expect(() => compiler.compileExpr({ kind: 'bogus' } as unknown as ExprNode)).toThrow(
      'Unexpected AST node: {"kind":"bogus"}',
    );
  });

  it('rejects an unknown merge action', () => {
    expect(() => compiler.compile(mergeWith({ kind: 'bogus' }))).toThrow(
      'Unexpected AST node: {"kind":"bogus"}',
    );
  });
});

describe('merge compilation', () => {
  it('compiles delete and do-nothing actions', () => {
    expect(compiler.compile(mergeWith({ kind: 'delete' })).text).toBe(
      'MERGE INTO "items" USING (VALUES ($1)) AS "s" ("id") ON "items"."id" = "s"."id" WHEN MATCHED THEN DELETE',
    );
    expect(compiler.compile(mergeWith({ kind: 'nothing' })).text).toContain(
      'WHEN MATCHED THEN DO NOTHING',
    );
  });

  it('compiles an insert of default values', () => {
    const node = mergeWith({ kind: 'insert', columns: [], values: [] });
    expect(compiler.compile(node).text).toContain('THEN INSERT DEFAULT VALUES');
  });
});
