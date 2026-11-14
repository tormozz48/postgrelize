export type ParamNode = Readonly<{ kind: 'param'; value: unknown }>;
export type RawNode = Readonly<{ kind: 'raw'; sql: string }>;
export type IdentNode = Readonly<{ kind: 'ident'; path: readonly string[] }>;
export type StarNode = Readonly<{ kind: 'star'; table?: string }>;
export type FnNode = Readonly<{
  kind: 'fn';
  name: string;
  args: readonly ExprNode[];
  distinct?: boolean;
}>;
export type CastNode = Readonly<{ kind: 'cast'; expr: ExprNode; type: string }>;
export type BinaryNode = Readonly<{ kind: 'binary'; op: string; left: ExprNode; right: ExprNode }>;
export type PrefixNode = Readonly<{ kind: 'prefix'; op: string; expr: ExprNode }>;
export type PostfixNode = Readonly<{ kind: 'postfix'; op: string; expr: ExprNode }>;
export type LogicalNode = Readonly<{ kind: 'and' | 'or'; items: readonly ExprNode[] }>;
export type ListNode = Readonly<{ kind: 'list'; items: readonly ExprNode[] }>;
export type BetweenNode = Readonly<{
  kind: 'between';
  expr: ExprNode;
  low: ExprNode;
  high: ExprNode;
  negated: boolean;
}>;
export type ExcludedNode = Readonly<{ kind: 'excluded'; column: string }>;
export type SubqueryNode = Readonly<{ kind: 'subquery'; query: SelectNode }>;
export type AliasNode = Readonly<{ kind: 'alias'; expr: ExprNode; alias: string }>;
export type OverNode = Readonly<{
  kind: 'over';
  expr: ExprNode;
  partitionBy: readonly ExprNode[];
  orderBy: readonly OrderNode[];
}>;
export type ValuesNode = Readonly<{ kind: 'values'; rows: readonly (readonly ExprNode[])[] }>;

export type ExprNode =
  | ParamNode
  | RawNode
  | IdentNode
  | StarNode
  | FnNode
  | CastNode
  | BinaryNode
  | PrefixNode
  | PostfixNode
  | LogicalNode
  | ListNode
  | BetweenNode
  | ExcludedNode
  | SubqueryNode
  | AliasNode
  | ValuesNode
  | OverNode;

export type TableRef = Readonly<{ name: string; schema?: string; alias?: string }>;

export type JoinNode = Readonly<{
  type: 'INNER' | 'LEFT OUTER' | 'RIGHT OUTER';
  table: TableRef | Readonly<{ subquery: SelectNode; alias: string }>;
  on: ExprNode;
}>;

export type OrderNode = Readonly<{
  expr: ExprNode;
  direction?: 'ASC' | 'DESC';
  nulls?: 'FIRST' | 'LAST';
}>;

export type LockNode = Readonly<{
  strength: 'UPDATE' | 'NO KEY UPDATE' | 'SHARE' | 'KEY SHARE';
  of?: readonly string[];
  wait?: 'NOWAIT' | 'SKIP LOCKED';
}>;

export type UnionNode = Readonly<{
  kind: 'union';
  left: SelectNode;
  right: SelectNode;
  all: boolean;
}>;

export type CteNode = Readonly<{
  name: string;
  query: SelectNode | UnionNode;
  materialized?: boolean;
}>;

export type WithClause = Readonly<{ recursive: boolean; ctes: readonly CteNode[] }>;

export type SelectNode = Readonly<{
  kind: 'select';
  with?: WithClause;
  extraFrom?: readonly FromItem[];
  distinct?: boolean;
  distinctOn?: readonly ExprNode[];
  columns: readonly ExprNode[];
  from: TableRef | Readonly<{ subquery: SelectNode; alias: string }>;
  joins?: readonly JoinNode[];
  where?: ExprNode;
  groupBy?: readonly ExprNode[];
  having?: ExprNode;
  orderBy?: readonly OrderNode[];
  limit?: number;
  offset?: number;
  lock?: LockNode;
}>;

export type ConflictTarget =
  | Readonly<{ kind: 'columns'; items: readonly ExprNode[]; where?: ExprNode }>
  | Readonly<{ kind: 'constraint'; name: string }>;

export type SetItem = Readonly<{ column: string; value: ExprNode }>;

export type OnConflictNode = Readonly<{
  target?: ConflictTarget;
  action:
    | Readonly<{ kind: 'nothing' }>
    | Readonly<{ kind: 'update'; set: readonly SetItem[]; where?: ExprNode }>;
}>;

export type FromItem = TableRef | Readonly<{ subquery: SelectNode; alias: string }>;

export type InsertNode = Readonly<{
  kind: 'insert';
  table: TableRef;
  columns: readonly string[];
  rows: readonly (readonly ExprNode[])[];
  select?: SelectNode;
  overriding?: 'system' | 'user';
  onConflict?: OnConflictNode;
  returning?: readonly ExprNode[];
}>;

export type UpdateNode = Readonly<{
  kind: 'update';
  table: TableRef;
  set: readonly SetItem[];
  from?: readonly FromItem[];
  where?: ExprNode;
  returning?: readonly ExprNode[];
}>;

export type DeleteNode = Readonly<{
  kind: 'delete';
  table: TableRef;
  using?: readonly FromItem[];
  where?: ExprNode;
  returning?: readonly ExprNode[];
}>;

export type TruncateNode = Readonly<{
  kind: 'truncate';
  table: TableRef;
  cascade?: boolean;
  restartIdentity?: boolean;
}>;

export type MergeAction =
  | Readonly<{ kind: 'update'; set: readonly SetItem[] }>
  | Readonly<{ kind: 'delete' }>
  | Readonly<{ kind: 'insert'; columns: readonly string[]; values: readonly ExprNode[] }>
  | Readonly<{ kind: 'nothing' }>;

export type MergeWhen = Readonly<{
  match: 'MATCHED' | 'NOT MATCHED' | 'NOT MATCHED BY SOURCE';
  condition?: ExprNode;
  action: MergeAction;
}>;

export type MergeNode = Readonly<{
  kind: 'merge';
  table: TableRef;
  source:
    | Readonly<{ kind: 'query'; query: SelectNode; alias: string }>
    | Readonly<{
        kind: 'values';
        columns: readonly string[];
        rows: readonly (readonly ExprNode[])[];
        alias: string;
      }>;
  on: ExprNode;
  when: readonly MergeWhen[];
  returning?: readonly ExprNode[];
}>;

export type StatementNode =
  | SelectNode
  | InsertNode
  | UpdateNode
  | DeleteNode
  | TruncateNode
  | MergeNode;

export const param = (value: unknown): ParamNode => ({ kind: 'param', value });
export const raw = (sql: string): RawNode => ({ kind: 'raw', sql });
export const ident = (...path: readonly string[]): IdentNode => ({ kind: 'ident', path });
export const binary = (op: string, left: ExprNode, right: ExprNode): BinaryNode => ({
  kind: 'binary',
  op,
  left,
  right,
});
export const and = (items: readonly ExprNode[]): LogicalNode => ({ kind: 'and', items });
export const or = (items: readonly ExprNode[]): LogicalNode => ({ kind: 'or', items });
export const fnCall = (name: string, args: readonly ExprNode[]): FnNode => ({
  kind: 'fn',
  name,
  args,
});
