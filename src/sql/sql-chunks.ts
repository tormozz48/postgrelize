import type { TableRef } from './ast.ts';
import { IdentifierQuoter } from './identifier-quoter.ts';

const quoter = new IdentifierQuoter();

/** Bound value inside a chunk list; the same chunk object maps to the same `$n`. */
export type ParamChunk = Readonly<{ param: unknown }>;
/** SQL text or a bound value. */
export type Chunk = string | ParamChunk;
/** Chunk list rendered by `SqlCompiler.finalize`. */
export type Chunks = readonly Chunk[];

/** Shared chunk helpers of the SQL compilers: quoting, wrapping, joining and table references. */
export class ChunkBuilder {
  /** Quotes an identifier: `"name"`, doubling embedded quotes. */
  protected readonly quote = (name: string): string => quoter.quote(name);

  /**
   * Joins chunk lists with a separator.
   *
   * @param parts - Chunk lists.
   * @param separator - SQL text between the lists.
   * @returns Joined chunks.
   */
  protected joinAll(parts: readonly Chunks[], separator: string): Chunks {
    const joined: Chunk[] = [];
    for (const [index, part] of parts.entries()) {
      if (index > 0) {
        joined.push(separator);
      }
      for (const chunk of part) {
        joined.push(chunk);
      }
    }
    return joined;
  }

  /**
   * Wraps chunks in parentheses.
   *
   * @param chunks - Chunks.
   * @returns `(chunks)`.
   */
  protected wrap(chunks: Chunks): Chunks {
    return ['(', ...chunks, ')'];
  }

  /**
   * Parenthesized quoted column list.
   *
   * @param columns - Column names.
   * @returns `("a", "b")`.
   */
  protected columnList(columns: readonly string[]): Chunks {
    return this.wrap([columns.map(this.quote).join(', ')]);
  }

  /**
   * Quoted table reference with an optional alias.
   *
   * @param table - Table reference.
   * @returns `"schema"."name" AS "alias"`.
   */
  protected tableRef(table: TableRef): Chunks {
    return [
      [table.schema, table.name]
        .filter((part): part is string => part !== undefined)
        .map(this.quote)
        .join('.'),
      ...(table.alias === undefined || table.alias === table.name
        ? []
        : [` AS ${this.quote(table.alias)}`]),
    ];
  }

  /**
   * Exhaustiveness guard of node switches.
   *
   * @param value - Unhandled node.
   * @throws Error always.
   */
  protected unexpected(value: never): never {
    throw new Error(`Unexpected AST node: ${JSON.stringify(value)}`);
  }
}
