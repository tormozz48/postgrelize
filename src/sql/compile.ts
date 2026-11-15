import type { ExprNode, StatementNode } from './ast.ts';
import { DmlCompiler } from './dml-compiler.ts';
import { IdentifierQuoter } from './identifier-quoter.ts';
import { MergeCompiler } from './merge-compiler.ts';
import { QueryCompiler } from './query-compiler.ts';
import type { Chunks, ParamChunk } from './sql-chunks.ts';

export type { Chunk, Chunks, ParamChunk } from './sql-chunks.ts';

/** Parameterized SQL text with its bound values. */
export type CompiledQuery = Readonly<{ text: string; values: readonly unknown[] }>;

const quoter = new IdentifierQuoter();

const assertNever = (value: never): never => {
  throw new Error(`Unexpected AST node: ${JSON.stringify(value)}`);
};

/** Compiles SQL AST nodes into parameterized text with `$n` placeholders. Stateless. */
export class SqlCompiler {
  readonly #query = new QueryCompiler();
  readonly #dml = new DmlCompiler(this.#query);
  readonly #merge = new MergeCompiler(this.#query, this.#dml);

  /** Quotes an identifier: `"name"`, doubling embedded quotes. */
  static quoteIdent(name: string): string {
    return quoter.quote(name);
  }

  /** Compiles a statement. */
  compile(node: StatementNode): CompiledQuery {
    return this.finalize(this.#statement(node));
  }

  /** Compiles a standalone expression. */
  compileExpr(node: ExprNode): CompiledQuery {
    return this.finalize(this.#query.expr.expression(node));
  }

  /** Joins chunks into text, numbering distinct parameter chunks `$1`, `$2`, ... */
  finalize(chunks: Chunks): CompiledQuery {
    const positions = new Map<ParamChunk, number>();
    const values: unknown[] = [];
    let text = '';
    for (const chunk of chunks) {
      if (typeof chunk === 'string') {
        text += chunk;
        continue;
      }
      let position = positions.get(chunk);
      if (position === undefined) {
        values.push(chunk.param);
        position = values.length;
        positions.set(chunk, position);
      }
      text += `$${position}`;
    }
    return { text, values };
  }

  #statement(node: StatementNode): Chunks {
    switch (node.kind) {
      case 'select':
        return this.#query.select(node);
      case 'setop':
        return this.#query.query(node);
      case 'insert':
        return this.#dml.insert(node);
      case 'update':
        return this.#dml.update(node);
      case 'delete':
        return this.#dml.delete(node);
      case 'truncate':
        return this.#dml.truncate(node);
      case 'merge':
        return this.#merge.merge(node);
      default:
        return assertNever(node);
    }
  }
}
