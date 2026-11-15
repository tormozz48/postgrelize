import type { ExprNode, OrderNode } from './ast-expressions.ts';
import type {
  FromItem,
  JoinNode,
  LockNode,
  MergeWhen,
  OnConflictNode,
  SetOperationNode,
  SetItem,
  TableRef,
  WithClause,
} from './ast-clauses.ts';

export type SelectNode = Readonly<{
  kind: 'select';
  with?: WithClause;
  extraFrom?: readonly FromItem[];
  distinct?: boolean;
  distinctOn?: readonly ExprNode[];
  columns: readonly ExprNode[];
  from: FromItem;
  joins?: readonly JoinNode[];
  where?: ExprNode;
  groupBy?: readonly ExprNode[];
  having?: ExprNode;
  orderBy?: readonly OrderNode[];
  limit?: number;
  /** `FETCH FIRST n ROWS WITH TIES` instead of `LIMIT n`; needs `limit` and `orderBy`. */
  withTies?: boolean;
  offset?: number;
  lock?: LockNode;
}>;

/** A query expression: a SELECT or a set operation over query expressions. */
export type QueryNode = SelectNode | SetOperationNode;

export type InsertNode = Readonly<{
  kind: 'insert';
  table: TableRef;
  columns: readonly string[];
  rows: readonly (readonly ExprNode[])[];
  select?: QueryNode;
  overriding?: 'system' | 'user';
  onConflict?: OnConflictNode;
  returning?: readonly ExprNode[];
  /** Alias of the pre-statement row in RETURNING (`WITH (OLD AS ...)`, PostgreSQL 18+). */
  returningOld?: string;
}>;

export type UpdateNode = Readonly<{
  kind: 'update';
  table: TableRef;
  set: readonly SetItem[];
  from?: readonly FromItem[];
  where?: ExprNode;
  returning?: readonly ExprNode[];
  /** Alias of the pre-statement row in RETURNING (`WITH (OLD AS ...)`, PostgreSQL 18+). */
  returningOld?: string;
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

export type MergeNode = Readonly<{
  kind: 'merge';
  table: TableRef;
  source:
    | Readonly<{ kind: 'query'; query: QueryNode; alias: string }>
    | Readonly<{
        kind: 'values';
        columns: readonly string[];
        rows: readonly (readonly ExprNode[])[];
        alias: string;
      }>;
  on: ExprNode;
  when: readonly MergeWhen[];
  returning?: readonly ExprNode[];
  /** Alias of the pre-statement row in RETURNING (`WITH (OLD AS ...)`, PostgreSQL 18+). */
  returningOld?: string;
}>;

/** Data-modifying statement usable as a CTE body. */
export type ModifyingNode = InsertNode | UpdateNode | DeleteNode;

export type StatementNode =
  | SelectNode
  | SetOperationNode
  | InsertNode
  | UpdateNode
  | DeleteNode
  | TruncateNode
  | MergeNode;
