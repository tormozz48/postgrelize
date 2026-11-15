import type { ExprNode, StatementNode } from './ast.ts';
import { DmlCompiler } from './dml-compiler.ts';
import { MergeCompiler } from './merge-compiler.ts';
import { QueryCompiler } from './query-compiler.ts';
import type { Chunk, Chunks, ParamChunk } from './sql-chunks.ts';

export type { Chunk, Chunks, ParamChunk } from './sql-chunks.ts';

/** Parameterized SQL text with its bound values. */
export type CompiledQuery = Readonly<{ text: string; values: readonly unknown[] }>;

const quote = (name: string): string => `"${name.replaceAll('"', '""')}"`;

const isParam = (chunk: Chunk): chunk is ParamChunk => typeof chunk !== 'string';

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
    return quote(name);
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
    const params = [...new Set(chunks.filter(isParam))];
    const positions = new Map(params.map((chunk, index) => [chunk, index + 1]));
    return {
      text: chunks
        .map((chunk) => (typeof chunk === 'string' ? chunk : `$${positions.get(chunk)}`))
        .join(''),
      values: params.map((chunk) => chunk.param),
    };
  }

  #statement(node: StatementNode): Chunks {
    switch (node.kind) {
      case 'select':
        return this.#query.select(node);
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
