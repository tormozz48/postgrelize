import type { ExprNode } from './ast-expressions.ts';
import type { SelectNode } from './ast-statements.ts';

export type TableRef = Readonly<{ name: string; schema?: string; alias?: string }>;

export type JoinNode = Readonly<{
  type: 'INNER' | 'LEFT OUTER' | 'RIGHT OUTER';
  table: TableRef | Readonly<{ subquery: SelectNode; alias: string }>;
  on: ExprNode;
}>;

export type FromItem = TableRef | Readonly<{ subquery: SelectNode; alias: string }>;

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
