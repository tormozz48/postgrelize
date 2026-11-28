import type { QueryNode } from './ast-statements.ts';

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
export type SubqueryNode = Readonly<{ kind: 'subquery'; query: QueryNode }>;
export type AliasNode = Readonly<{ kind: 'alias'; expr: ExprNode; alias: string }>;
export type OverNode = Readonly<{
  kind: 'over';
  expr: ExprNode;
  partitionBy: readonly ExprNode[];
  orderBy: readonly OrderNode[];
}>;
export type FilterNode = Readonly<{ kind: 'filter'; expr: ExprNode; where: ExprNode }>;
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
  | OverNode
  | FilterNode;

export type OrderNode = Readonly<{
  expr: ExprNode;
  direction?: 'ASC' | 'DESC';
  nulls?: 'FIRST' | 'LAST';
}>;
