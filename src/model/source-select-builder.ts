import { SqlExpression } from '../expressions/methods.ts';
import type { ExprNode, OrderNode, SelectNode } from '../sql/ast.ts';
import { OrderDirection } from '../sql/order.ts';
import { columnPath, nestedColumnPath } from '../where/where-support.ts';
import { WhereCompiler } from '../where/where.ts';
import type { CteBuilder } from './cte-builder.ts';
import { JoinClauses } from './join-clauses.ts';
import type { JoinSourceBuilder } from './join-source-builder.ts';
import type { SourceQueryOptions } from './source-query-options.ts';

const list = (value: unknown): readonly unknown[] =>
  value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];

/** Builds the SELECT of `sequelize.select` / `sequelize.subquery`: sources only, no model. */
export class SourceSelectBuilder {
  readonly #sources: JoinSourceBuilder;
  readonly #cte: CteBuilder;
  readonly #joins = new JoinClauses();
  readonly #where = new WhereCompiler({ resolve: () => undefined });

  /**
   * @param sources - Converts `from` / `joins` entries.
   * @param cte - `WITH` clause.
   */
  constructor(sources: JoinSourceBuilder, cte: CteBuilder) {
    this.#sources = sources;
    this.#cte = cte;
  }

  /**
   * @param options - Query options.
   * @returns SELECT node.
   * @throws Error without a `from` entry.
   */
  build(options: SourceQueryOptions): SelectNode {
    const [from, ...extraFrom] = this.#sources.build(options.from);
    if (from === undefined) {
      throw new Error('from needs at least one source');
    }
    const withClause = this.#cte.withClause(options.with);
    const joins = this.#joins.build(this.#sources.joins(options.joins), this.#where);
    return {
      kind: 'select',
      ...(withClause === undefined ? {} : { with: withClause }),
      ...(options.distinct === true ? { distinct: true } : {}),
      columns: this.#columns(options.attributes),
      from,
      ...(joins.length === 0 ? {} : { joins }),
      ...(extraFrom.length === 0 ? {} : { extraFrom }),
      ...this.#filters(options),
      ...SourceSelectBuilder.#window(options),
    };
  }

  #filters(options: SourceQueryOptions): Partial<SelectNode> {
    const { where, group, having, order } = options;
    const groupBy = list(group).map((item) => this.#target(item));
    const orderBy = (order instanceof SqlExpression ? [order] : list(order)).map((item) =>
      this.#order(item),
    );
    return {
      ...(WhereCompiler.isEmpty(where) ? {} : { where: this.#where.compile(where) }),
      ...(groupBy.length === 0 ? {} : { groupBy }),
      ...(WhereCompiler.isEmpty(having) ? {} : { having: this.#where.compile(having) }),
      ...(orderBy.length === 0 ? {} : { orderBy }),
    };
  }

  static #window({ limit, offset }: SourceQueryOptions): Partial<SelectNode> {
    return {
      ...(limit === undefined || limit === null ? {} : { limit }),
      ...(offset === undefined || offset === null ? {} : { offset }),
    };
  }

  #columns(attributes: SourceQueryOptions['attributes']): readonly ExprNode[] {
    return attributes === undefined
      ? [{ kind: 'star' }]
      : attributes.map((item): ExprNode => {
          if (!Array.isArray(item)) {
            return this.#target(item);
          }
          const [source, alias] = item as readonly [unknown, string];
          return { kind: 'alias', expr: this.#target(source), alias };
        });
  }

  // `'alias.*'` selects every column of one source
  #target(value: unknown): ExprNode {
    if (typeof value !== 'string') {
      return this.#where.toExpr(value);
    }
    if (value === '*') {
      return columnPath(value);
    }
    return value.endsWith('.*')
      ? { kind: 'star', table: value.slice(0, -2) }
      : nestedColumnPath(value);
  }

  #order(item: unknown): OrderNode {
    if (!Array.isArray(item)) {
      return { expr: this.#target(item) };
    }
    const [target, direction]: readonly unknown[] = item;
    return {
      expr: this.#target(target),
      ...(direction === undefined ? {} : OrderDirection.parse(direction)),
    };
  }
}
