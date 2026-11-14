import type {
  ConflictTarget,
  DeleteNode,
  ExprNode,
  InsertNode,
  JoinNode,
  MergeAction,
  MergeNode,
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

export type CompiledQuery = Readonly<{ text: string; values: readonly unknown[] }>;

export type ParamChunk = Readonly<{ param: unknown }>;
export type Chunk = string | ParamChunk;
export type Chunks = readonly Chunk[];

export const quoteIdent = (name: string): string => `"${name.replaceAll('"', '""')}"`;

const join = (parts: readonly Chunks[], separator: string): Chunks =>
  parts.flatMap((part, index) => (index === 0 ? part : [separator, ...part]));

const wrap = (chunks: Chunks): Chunks => ['(', ...chunks, ')'];

const exprList = (items: readonly ExprNode[]): Chunks => join(items.map(expr), ', ');

const tableRef = (table: TableRef): Chunks => [
  [table.schema, table.name]
    .filter((part): part is string => part !== undefined)
    .map(quoteIdent)
    .join('.'),
  ...(table.alias === undefined || table.alias === table.name
    ? []
    : [` AS ${quoteIdent(table.alias)}`]),
];

const fromItem = (from: SelectNode['from']): Chunks =>
  'subquery' in from
    ? [...wrap(select(from.subquery)), ` AS ${quoteIdent(from.alias)}`]
    : tableRef(from);

const assertNever = (value: never): never => {
  throw new Error(`Unexpected AST node: ${JSON.stringify(value)}`);
};

const expr = (node: ExprNode): Chunks => {
  switch (node.kind) {
    case 'param':
      return [{ param: node.value }];
    case 'raw':
      return [node.sql];
    case 'ident':
      return [node.path.map(quoteIdent).join('.')];
    case 'star':
      return [node.table === undefined ? '*' : `${quoteIdent(node.table)}.*`];
    case 'fn':
      return [
        `${node.name}(`,
        ...(node.distinct === true ? ['DISTINCT '] : []),
        ...exprList(node.args),
        ')',
      ];
    case 'cast':
      return ['CAST(', ...expr(node.expr), ` AS ${node.type})`];
    case 'binary':
      return [...expr(node.left), ` ${node.op} `, ...expr(node.right)];
    case 'prefix':
      return [`${node.op} `, ...expr(node.expr)];
    case 'postfix':
      return [...expr(node.expr), ` ${node.op}`];
    case 'and':
    case 'or':
      return node.items.length === 0
        ? [node.kind === 'and' ? 'TRUE' : 'FALSE']
        : node.items.length === 1 && node.items[0] !== undefined
          ? expr(node.items[0])
          : wrap(join(node.items.map(expr), ` ${node.kind.toUpperCase()} `));
    case 'list':
      return wrap(exprList(node.items));
    case 'between':
      return [
        ...expr(node.expr),
        node.negated ? ' NOT BETWEEN ' : ' BETWEEN ',
        ...expr(node.low),
        ' AND ',
        ...expr(node.high),
      ];
    case 'excluded':
      return [`EXCLUDED.${quoteIdent(node.column)}`];
    case 'subquery':
      return wrap(select(node.query));
    case 'alias':
      return [...expr(node.expr), ` AS ${quoteIdent(node.alias)}`];
    case 'over':
      return [
        ...expr(node.expr),
        ' OVER (',
        ...join(
          [
            ...(node.partitionBy.length === 0
              ? []
              : [['PARTITION BY ', ...exprList(node.partitionBy)]]),
            ...(node.orderBy.length === 0
              ? []
              : [['ORDER BY ', ...join(node.orderBy.map(orderItem), ', ')]]),
          ],
          ' ',
        ),
        ')',
      ];
    case 'values':
      return [
        'VALUES ',
        ...join(
          node.rows.map((row) => wrap(exprList(row))),
          ', ',
        ),
      ];
    default:
      return assertNever(node);
  }
};

const joinClause = (node: JoinNode): Chunks => [
  ` ${node.type} JOIN `,
  ...fromItem(node.table),
  ' ON ',
  ...expr(node.on),
];

const orderItem = (node: OrderNode): Chunks => [
  ...expr(node.expr),
  ...(node.direction === undefined ? [] : [` ${node.direction}`]),
  ...(node.nulls === undefined ? [] : [` NULLS ${node.nulls}`]),
];

const lockClause = (node: LockNode): string =>
  [
    ` FOR ${node.strength}`,
    node.of === undefined || node.of.length === 0
      ? ''
      : ` OF ${node.of.map(quoteIdent).join(', ')}`,
    node.wait === undefined ? '' : ` ${node.wait}`,
  ].join('');

const optional = <T>(value: T | undefined, render: (value: T) => Chunks): Chunks =>
  value === undefined ? [] : render(value);

const nonEmpty = <T>(
  items: readonly T[] | undefined,
  render: (items: readonly T[]) => Chunks,
): Chunks => (items === undefined || items.length === 0 ? [] : render(items));

const returning = (items: readonly ExprNode[] | undefined): Chunks =>
  nonEmpty(items, (list) => [' RETURNING ', ...exprList(list)]);

const where = (node: ExprNode | undefined): Chunks =>
  optional(node, (cond) => [' WHERE ', ...expr(cond)]);

const select = (node: SelectNode): Chunks => [
  node.distinct === true || (node.distinctOn ?? []).length > 0 ? 'SELECT DISTINCT ' : 'SELECT ',
  ...nonEmpty(node.distinctOn, (items) => ['ON ', ...wrap(exprList(items)), ' ']),
  ...exprList(node.columns),
  ' FROM ',
  ...fromItem(node.from),
  ...(node.joins ?? []).flatMap(joinClause),
  ...where(node.where),
  ...nonEmpty(node.groupBy, (items) => [' GROUP BY ', ...exprList(items)]),
  ...optional(node.having, (cond) => [' HAVING ', ...expr(cond)]),
  ...nonEmpty(node.orderBy, (items) => [' ORDER BY ', ...join(items.map(orderItem), ', ')]),
  ...optional(node.limit, (limit) => [' LIMIT ', { param: limit }]),
  ...optional(node.offset, (offset) => [' OFFSET ', { param: offset }]),
  ...optional(node.lock, (lock) => [lockClause(lock)]),
];

const setList = (items: readonly SetItem[]): Chunks =>
  join(
    items.map((item) => [`${quoteIdent(item.column)} = `, ...expr(item.value)]),
    ', ',
  );

const conflictTarget = (target: ConflictTarget): Chunks =>
  target.kind === 'constraint'
    ? [` ON CONSTRAINT ${quoteIdent(target.name)}`]
    : [' ', ...wrap(exprList(target.items)), ...where(target.where)];

const onConflict = (node: OnConflictNode): Chunks => [
  ' ON CONFLICT',
  ...optional(node.target, conflictTarget),
  ...(node.action.kind === 'nothing'
    ? [' DO NOTHING']
    : [' DO UPDATE SET ', ...setList(node.action.set), ...where(node.action.where)]),
];

const insertValues = (node: InsertNode): Chunks =>
  node.select !== undefined
    ? [' ', ...wrap([node.columns.map(quoteIdent).join(', ')]), ' ', ...select(node.select)]
    : node.columns.length === 0
      ? [' DEFAULT VALUES']
      : [
          ' ',
          ...wrap([node.columns.map(quoteIdent).join(', ')]),
          ' VALUES ',
          ...join(
            node.rows.map((row) => wrap(exprList(row))),
            ', ',
          ),
        ];

const insert = (node: InsertNode): Chunks => [
  'INSERT INTO ',
  ...tableRef(node.table),
  ...insertValues(node),
  ...optional(node.onConflict, onConflict),
  ...returning(node.returning),
];

const update = (node: UpdateNode): Chunks => [
  'UPDATE ',
  ...tableRef(node.table),
  ' SET ',
  ...setList(node.set),
  ...nonEmpty(node.from, (items) => [' FROM ', ...join(items.map(fromItem), ', ')]),
  ...where(node.where),
  ...returning(node.returning),
];

const remove = (node: DeleteNode): Chunks => [
  'DELETE FROM ',
  ...tableRef(node.table),
  ...nonEmpty(node.using, (items) => [' USING ', ...join(items.map(fromItem), ', ')]),
  ...where(node.where),
  ...returning(node.returning),
];

const truncate = (node: TruncateNode): Chunks => [
  'TRUNCATE ',
  ...tableRef(node.table),
  node.restartIdentity === true ? ' RESTART IDENTITY' : '',
  node.cascade === true ? ' CASCADE' : '',
];

const mergeAction = (action: MergeAction): Chunks => {
  switch (action.kind) {
    case 'update':
      return ['UPDATE SET ', ...setList(action.set)];
    case 'delete':
      return ['DELETE'];
    case 'nothing':
      return ['DO NOTHING'];
    case 'insert':
      return action.columns.length === 0
        ? ['INSERT DEFAULT VALUES']
        : [
            'INSERT ',
            ...wrap([action.columns.map(quoteIdent).join(', ')]),
            ' VALUES ',
            ...wrap(exprList(action.values)),
          ];
    default:
      return assertNever(action);
  }
};

const mergeSource = (source: MergeNode['source']): Chunks =>
  source.kind === 'query'
    ? [...wrap(select(source.query)), ` AS ${quoteIdent(source.alias)}`]
    : [
        ...wrap([
          'VALUES ',
          ...join(
            source.rows.map((row) => wrap(exprList(row))),
            ', ',
          ),
        ]),
        ` AS ${quoteIdent(source.alias)} `,
        ...wrap([source.columns.map(quoteIdent).join(', ')]),
      ];

const merge = (node: MergeNode): Chunks => [
  'MERGE INTO ',
  ...tableRef(node.table),
  ' USING ',
  ...mergeSource(node.source),
  ' ON ',
  ...expr(node.on),
  ...node.when.flatMap((clause) => [
    ` WHEN ${clause.match}`,
    ...optional(clause.condition, (condition) => [' AND ', ...expr(condition)]),
    ' THEN ',
    ...mergeAction(clause.action),
  ]),
  ...returning(node.returning),
];

const statement = (node: StatementNode): Chunks => {
  switch (node.kind) {
    case 'select':
      return select(node);
    case 'insert':
      return insert(node);
    case 'update':
      return update(node);
    case 'delete':
      return remove(node);
    case 'truncate':
      return truncate(node);
    case 'merge':
      return merge(node);
    default:
      return assertNever(node);
  }
};

const isParam = (chunk: Chunk): chunk is ParamChunk => typeof chunk !== 'string';

export const finalize = (chunks: Chunks): CompiledQuery => {
  const params = [...new Set(chunks.filter(isParam))];
  const positions = new Map(params.map((chunk, index) => [chunk, index + 1]));
  return {
    text: chunks
      .map((chunk) => (typeof chunk === 'string' ? chunk : `$${positions.get(chunk)}`))
      .join(''),
    values: params.map((chunk) => chunk.param),
  };
};

export const compile = (node: StatementNode): CompiledQuery => finalize(statement(node));

export const compileExpr = (node: ExprNode): CompiledQuery => finalize(expr(node));
