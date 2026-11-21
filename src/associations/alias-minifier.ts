import type { ExprNode, SelectNode } from '../sql/ast.ts';
import type { CompiledQuery } from '../sql/compile.ts';
import type { IncludeNode } from './include.ts';

type Row = Readonly<Record<string, unknown>>;

/** Table aliases shorter than this are never minified (PostgreSQL identifiers hold 63 bytes). */
const TABLE_ALIAS_LIMIT = 64;

/** A SELECT with shortened include aliases, and what is needed to read its rows back. */
export type MinifiedSelect = Readonly<{
  select: SelectNode;
  tableAliases: ReadonlyMap<string, string>;
  columnAliases: ReadonlyMap<string, string>;
}>;

const paths = (nodes: readonly IncludeNode[]): readonly string[] =>
  nodes.flatMap((node) => [
    node.path,
    ...(node.through === undefined ? [] : [node.through.path]),
    ...paths(node.children),
  ]);

const tableAliases = (nodes: readonly IncludeNode[]): readonly string[] =>
  nodes.flatMap((node) => [
    node.alias,
    ...(node.through === undefined ? [] : [node.through.alias]),
    ...tableAliases(node.children),
  ]);

/**
 * `minifyAliases` (Sequelize v6): replaces the aliases of include columns (`Posts.Comments.title`)
 * with `_0`, `_1`, ... and table aliases of 64 or more characters with `%0`, `%1`, ..., so they stay
 * within PostgreSQL's 63-byte identifier limit (longer ones are truncated and can collide), and maps
 * result rows back to the original names.
 */
export class AliasMinifier {
  /**
   * Shortens the include column aliases of a SELECT.
   *
   * @param select - SELECT with joined includes.
   * @param includes - Include tree of the find.
   * @returns SELECT with `_N` column aliases and the alias maps.
   */
  minify(select: SelectNode, includes: readonly IncludeNode[]): MinifiedSelect {
    const prefixes = paths(includes).map((path) => `${path}.`);
    const columnAliases = new Map<string, string>();
    const columns = select.columns.map((column): ExprNode => {
      if (column.kind !== 'alias' || !prefixes.some((prefix) => column.alias.startsWith(prefix))) {
        return column;
      }
      const short = `_${columnAliases.size}`;
      columnAliases.set(short, column.alias);
      return { ...column, alias: short };
    });
    const long = [...new Set(tableAliases(includes))].filter(
      (alias) => alias.length >= TABLE_ALIAS_LIMIT,
    );
    return {
      select: { ...select, columns },
      tableAliases: new Map(long.map((alias, index) => [alias, `%${index}`])),
      columnAliases,
    };
  }

  /**
   * Replaces the long table aliases in compiled SQL (quoted identifiers only).
   *
   * @param query - Compiled query.
   * @param minified - Result of {@link AliasMinifier.minify}.
   * @returns Query with the short table aliases.
   */
  rewrite(query: CompiledQuery, minified: MinifiedSelect): CompiledQuery {
    const text = [...minified.tableAliases].reduce(
      (sql, [alias, short]) => sql.split(`"${alias}"`).join(`"${short}"`),
      query.text,
    );
    return { ...query, text };
  }

  /**
   * Restores the original column names in result rows.
   *
   * @param rows - Rows returned for the minified SELECT.
   * @param minified - Result of {@link AliasMinifier.minify}.
   * @returns Rows keyed by the original aliases.
   */
  restore(rows: readonly Row[], minified: MinifiedSelect): readonly Row[] {
    return rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [minified.columnAliases.get(key) ?? key, value]),
      ),
    );
  }
}
