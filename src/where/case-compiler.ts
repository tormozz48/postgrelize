import type { Case } from '../expressions/case-expression.ts';
import { SqlExpression } from '../expressions/methods.ts';
import type { ExprNode } from '../sql/ast.ts';
import type { ExprConverter } from './where-support.ts';

const INT4_MAX = 2_147_483_647;

/** Where compiler operations a `CASE` needs: conditions and values. */
export type CaseConverter = ExprConverter & Readonly<{ compile(where: unknown): ExprNode }>;

// An untyped parameter in a THEN or ELSE resolves to text, so `THEN $1` would order 10 before 2.
const resultType = (value: unknown): string | undefined => {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value)
      ? Math.abs(value) > INT4_MAX
        ? 'bigint'
        : 'integer'
      : 'double precision';
  }
  if (typeof value === 'bigint') {
    return 'bigint';
  }
  if (typeof value === 'boolean') {
    return 'boolean';
  }
  return value instanceof Date ? 'timestamptz' : undefined;
};

/** Compiles `caseWhen()` expressions into `CASE` nodes. */
export class CaseCompiler {
  /**
   * @param compiler - Compiler of the conditions and results.
   * @param value - Case expression.
   * @returns CASE node.
   * @throws Error without a `WHEN` branch.
   */
  case(compiler: CaseConverter, value: Case): ExprNode {
    if (value.branches.length === 0) {
      throw new Error('caseWhen() needs at least one when(condition, value)');
    }
    return {
      kind: 'case',
      branches: value.branches.map((branch) => ({
        when: compiler.compile(branch.when),
        result: this.#result(compiler, branch.result),
      })),
      ...(value.otherwise === undefined
        ? {}
        : { otherwise: this.#result(compiler, value.otherwise.value) }),
    };
  }

  #result(compiler: CaseConverter, value: unknown): ExprNode {
    if (value instanceof SqlExpression) {
      return compiler.toExpr(value);
    }
    const type = resultType(value);
    const param: ExprNode = { kind: 'param', value };
    return type === undefined ? param : { kind: 'cast', expr: param, type };
  }
}
