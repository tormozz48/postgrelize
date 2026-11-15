import type {
  ConflictTarget,
  DeleteNode,
  ExprNode,
  InsertNode,
  JoinNode,
  MergeAction,
  MergeNode,
  UnionNode,
  WithClause,
  LockNode,
  OnConflictNode,
  OrderNode,
  SelectNode,
  SetItem,
  StatementNode,
  TableRef,
  TruncateNode,
  UpdateNode,
} from './ast.ts';

/** Parameterized SQL text with its bound values. */
export type CompiledQuery = Readonly<{ text: string; values: readonly unknown[] }>;

/** Bound value inside a chunk list; the same chunk object maps to the same `$n`. */
export type ParamChunk = Readonly<{ param: unknown }>;
/** SQL text or a bound value. */
export type Chunk = string | ParamChunk;
/** Chunk list rendered by {@link SqlCompiler.finalize}. */
export type Chunks = readonly Chunk[];

type FromSource = SelectNode['from'];

const quote = (name: string): string => `"${name.replaceAll('"', '""')}"`;

const isParam = (chunk: Chunk): chunk is ParamChunk => typeof chunk !== 'string';

const assertNever = (value: never): never => {
  throw new Error(`Unexpected AST node: ${JSON.stringify(value)}`);
};

/** Compiles SQL AST nodes into parameterized text with `$n` placeholders. Stateless. */
export class SqlCompiler {
  /** Quotes an identifier: `"name"`, doubling embedded quotes. */
  static quoteIdent(name: string): string {
    return quote(name);
  }

  readonly #expr = (node: ExprNode): Chunks => this.#expression(node);
  readonly #orderItem = (node: OrderNode): Chunks => this.#order(node);
  readonly #fromItem = (from: FromSource): Chunks => this.#from(from);
  readonly #row = (row: readonly ExprNode[]): Chunks => this.#wrap(this.#exprList(row));
  readonly #joinClause = (node: JoinNode): Chunks => this.#join(node);

  /** Compiles a statement. */
  compile(node: StatementNode): CompiledQuery {
    return this.finalize(this.#statement(node));
  }

  /** Compiles a standalone expression. */
  compileExpr(node: ExprNode): CompiledQuery {
    return this.finalize(this.#expression(node));
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

  #joinAll(parts: readonly Chunks[], separator: string): Chunks {
    return parts.flatMap((part, index) => (index === 0 ? part : [separator, ...part]));
  }

  #wrap(chunks: Chunks): Chunks {
    return ['(', ...chunks, ')'];
  }

  #exprList(items: readonly ExprNode[]): Chunks {
    return this.#joinAll(items.map(this.#expr), ', ');
  }

  #columnList(columns: readonly string[]): Chunks {
    return this.#wrap([columns.map(quote).join(', ')]);
  }

  #tableRef(table: TableRef): Chunks {
    return [
      [table.schema, table.name]
        .filter((part): part is string => part !== undefined)
        .map(quote)
        .join('.'),
      ...(table.alias === undefined || table.alias === table.name
        ? []
        : [` AS ${quote(table.alias)}`]),
    ];
  }

  #from(from: FromSource): Chunks {
    return 'subquery' in from
      ? [...this.#wrap(this.#select(from.subquery)), ` AS ${quote(from.alias)}`]
      : this.#tableRef(from);
  }

  #expression(node: ExprNode): Chunks {
    switch (node.kind) {
      case 'param':
        return [{ param: node.value }];
      case 'raw':
        return [node.sql];
      case 'ident':
        return [node.path.map(quote).join('.')];
      case 'star':
        return [node.table === undefined ? '*' : `${quote(node.table)}.*`];
      case 'fn':
        return [
          `${node.name}(`,
          ...(node.distinct === true ? ['DISTINCT '] : []),
          ...this.#exprList(node.args),
          ')',
        ];
      case 'cast':
        return ['CAST(', ...this.#expression(node.expr), ` AS ${node.type})`];
      case 'binary':
        return [...this.#expression(node.left), ` ${node.op} `, ...this.#expression(node.right)];
      case 'prefix':
        return [`${node.op} `, ...this.#expression(node.expr)];
      case 'postfix':
        return [...this.#expression(node.expr), ` ${node.op}`];
      case 'and':
      case 'or':
        return node.items.length === 0
          ? [node.kind === 'and' ? 'TRUE' : 'FALSE']
          : node.items.length === 1 && node.items[0] !== undefined
            ? this.#expression(node.items[0])
            : this.#wrap(this.#joinAll(node.items.map(this.#expr), ` ${node.kind.toUpperCase()} `));
      case 'list':
        return this.#wrap(this.#exprList(node.items));
      case 'between':
        return [
          ...this.#expression(node.expr),
          node.negated ? ' NOT BETWEEN ' : ' BETWEEN ',
          ...this.#expression(node.low),
          ' AND ',
          ...this.#expression(node.high),
        ];
      case 'excluded':
        return [`EXCLUDED.${quote(node.column)}`];
      case 'subquery':
        return this.#wrap(this.#select(node.query));
      case 'alias':
        return [...this.#expression(node.expr), ` AS ${quote(node.alias)}`];
      case 'over':
        return [
          ...this.#expression(node.expr),
          ' OVER (',
          ...this.#joinAll(
            [
              ...(node.partitionBy.length === 0
                ? []
                : [['PARTITION BY ', ...this.#exprList(node.partitionBy)]]),
              ...(node.orderBy.length === 0
                ? []
                : [['ORDER BY ', ...this.#joinAll(node.orderBy.map(this.#orderItem), ', ')]]),
            ],
            ' ',
          ),
          ')',
        ];
      case 'values':
        return ['VALUES ', ...this.#joinAll(node.rows.map(this.#row), ', ')];
      default:
        return assertNever(node);
    }
  }

  #join(node: JoinNode): Chunks {
    return [` ${node.type} JOIN `, ...this.#from(node.table), ' ON ', ...this.#expression(node.on)];
  }

  #order(node: OrderNode): Chunks {
    return [
      ...this.#expression(node.expr),
      ...(node.direction === undefined ? [] : [` ${node.direction}`]),
      ...(node.nulls === undefined ? [] : [` NULLS ${node.nulls}`]),
    ];
  }

  #lock(node: LockNode): string {
    return [
      ` FOR ${node.strength}`,
      node.of === undefined || node.of.length === 0 ? '' : ` OF ${node.of.map(quote).join(', ')}`,
      node.wait === undefined ? '' : ` ${node.wait}`,
    ].join('');
  }

  #returning(items: readonly ExprNode[] | undefined, oldAlias?: string): Chunks {
    return items === undefined || items.length === 0
      ? []
      : [
          ' RETURNING ',
          oldAlias === undefined ? '' : `WITH (OLD AS ${quote(oldAlias)}) `,
          ...this.#exprList(items),
        ];
  }

  #where(node: ExprNode | undefined): Chunks {
    return node === undefined ? [] : [' WHERE ', ...this.#expression(node)];
  }

  #queryExpr(node: SelectNode | UnionNode): Chunks {
    return node.kind === 'union'
      ? [
          ...this.#select(node.left),
          node.all ? ' UNION ALL ' : ' UNION ',
          ...this.#select(node.right),
        ]
      : this.#select(node);
  }

  #with(clause: WithClause): Chunks {
    return [
      clause.recursive ? 'WITH RECURSIVE ' : 'WITH ',
      ...this.#joinAll(
        clause.ctes.map((cte) => [
          `${quote(cte.name)} AS `,
          cte.materialized === undefined
            ? ''
            : cte.materialized
              ? 'MATERIALIZED '
              : 'NOT MATERIALIZED ',
          ...this.#wrap(this.#queryExpr(cte.query)),
        ]),
        ', ',
      ),
      ' ',
    ];
  }

  #select(node: SelectNode): Chunks {
    const distinctOn = node.distinctOn ?? [];
    return [
      ...(node.with === undefined ? [] : this.#with(node.with)),
      node.distinct === true || distinctOn.length > 0 ? 'SELECT DISTINCT ' : 'SELECT ',
      ...(distinctOn.length === 0 ? [] : ['ON ', ...this.#wrap(this.#exprList(distinctOn)), ' ']),
      ...this.#exprList(node.columns),
      ' FROM ',
      ...this.#from(node.from),
      ...(node.joins ?? []).flatMap(this.#joinClause),
      ...(node.extraFrom ?? []).flatMap((item) => [', ', ...this.#from(item)]),
      ...this.#where(node.where),
      ...(node.groupBy === undefined || node.groupBy.length === 0
        ? []
        : [' GROUP BY ', ...this.#exprList(node.groupBy)]),
      ...(node.having === undefined ? [] : [' HAVING ', ...this.#expression(node.having)]),
      ...(node.orderBy === undefined || node.orderBy.length === 0
        ? []
        : [' ORDER BY ', ...this.#joinAll(node.orderBy.map(this.#orderItem), ', ')]),
      ...(node.limit === undefined ? [] : [' LIMIT ', { param: node.limit }]),
      ...(node.offset === undefined ? [] : [' OFFSET ', { param: node.offset }]),
      ...(node.lock === undefined ? [] : [this.#lock(node.lock)]),
    ];
  }

  #setList(items: readonly SetItem[]): Chunks {
    return this.#joinAll(
      items.map((item) => [`${quote(item.column)} = `, ...this.#expression(item.value)]),
      ', ',
    );
  }

  #conflictTarget(target: ConflictTarget): Chunks {
    return target.kind === 'constraint'
      ? [` ON CONSTRAINT ${quote(target.name)}`]
      : [' ', ...this.#wrap(this.#exprList(target.items)), ...this.#where(target.where)];
  }

  #onConflict(node: OnConflictNode): Chunks {
    return [
      ' ON CONFLICT',
      ...(node.target === undefined ? [] : this.#conflictTarget(node.target)),
      ...(node.action.kind === 'nothing'
        ? [' DO NOTHING']
        : [
            ' DO UPDATE SET ',
            ...this.#setList(node.action.set),
            ...this.#where(node.action.where),
          ]),
    ];
  }

  #insertValues(node: InsertNode): Chunks {
    return node.select !== undefined
      ? [' ', ...this.#columnList(node.columns), ' ', ...this.#select(node.select)]
      : node.columns.length === 0
        ? [' DEFAULT VALUES']
        : [
            ' ',
            ...this.#columnList(node.columns),
            node.overriding === undefined
              ? ''
              : ` OVERRIDING ${node.overriding === 'system' ? 'SYSTEM' : 'USER'} VALUE`,
            ' VALUES ',
            ...this.#joinAll(node.rows.map(this.#row), ', '),
          ];
  }

  #insert(node: InsertNode): Chunks {
    return [
      'INSERT INTO ',
      ...this.#tableRef(node.table),
      ...this.#insertValues(node),
      ...(node.onConflict === undefined ? [] : this.#onConflict(node.onConflict)),
      ...this.#returning(node.returning, node.returningOld),
    ];
  }

  #update(node: UpdateNode): Chunks {
    return [
      'UPDATE ',
      ...this.#tableRef(node.table),
      ' SET ',
      ...this.#setList(node.set),
      ...(node.from === undefined || node.from.length === 0
        ? []
        : [' FROM ', ...this.#joinAll(node.from.map(this.#fromItem), ', ')]),
      ...this.#where(node.where),
      ...this.#returning(node.returning, node.returningOld),
    ];
  }

  #delete(node: DeleteNode): Chunks {
    return [
      'DELETE FROM ',
      ...this.#tableRef(node.table),
      ...(node.using === undefined || node.using.length === 0
        ? []
        : [' USING ', ...this.#joinAll(node.using.map(this.#fromItem), ', ')]),
      ...this.#where(node.where),
      ...this.#returning(node.returning),
    ];
  }

  #truncate(node: TruncateNode): Chunks {
    return [
      'TRUNCATE ',
      ...this.#tableRef(node.table),
      node.restartIdentity === true ? ' RESTART IDENTITY' : '',
      node.cascade === true ? ' CASCADE' : '',
    ];
  }

  #mergeAction(action: MergeAction): Chunks {
    switch (action.kind) {
      case 'update':
        return ['UPDATE SET ', ...this.#setList(action.set)];
      case 'delete':
        return ['DELETE'];
      case 'nothing':
        return ['DO NOTHING'];
      case 'insert':
        return action.columns.length === 0
          ? ['INSERT DEFAULT VALUES']
          : [
              'INSERT ',
              ...this.#columnList(action.columns),
              ' VALUES ',
              ...this.#wrap(this.#exprList(action.values)),
            ];
      default:
        return assertNever(action);
    }
  }

  #mergeSource(source: MergeNode['source']): Chunks {
    return source.kind === 'query'
      ? [...this.#wrap(this.#select(source.query)), ` AS ${quote(source.alias)}`]
      : [
          ...this.#wrap(['VALUES ', ...this.#joinAll(source.rows.map(this.#row), ', ')]),
          ` AS ${quote(source.alias)} `,
          ...this.#columnList(source.columns),
        ];
  }

  #merge(node: MergeNode): Chunks {
    return [
      'MERGE INTO ',
      ...this.#tableRef(node.table),
      ' USING ',
      ...this.#mergeSource(node.source),
      ' ON ',
      ...this.#expression(node.on),
      ...node.when.flatMap((clause) => [
        ` WHEN ${clause.match}`,
        ...(clause.condition === undefined ? [] : [' AND ', ...this.#expression(clause.condition)]),
        ' THEN ',
        ...this.#mergeAction(clause.action),
      ]),
      ...this.#returning(node.returning, node.returningOld),
    ];
  }

  #statement(node: StatementNode): Chunks {
    switch (node.kind) {
      case 'select':
        return this.#select(node);
      case 'insert':
        return this.#insert(node);
      case 'update':
        return this.#update(node);
      case 'delete':
        return this.#delete(node);
      case 'truncate':
        return this.#truncate(node);
      case 'merge':
        return this.#merge(node);
      default:
        return assertNever(node);
    }
  }
}
