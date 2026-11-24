import type { ExprNode } from './ast-expressions.ts';
import type { ModifyingNode, QueryNode } from './ast-statements.ts';

/** `TABLESAMPLE method (percent) [REPEATABLE (seed)]` of a FROM table. */
export type TableSample = Readonly<{
  method: 'BERNOULLI' | 'SYSTEM';
  percent: ExprNode;
  seed?: ExprNode;
}>;

export type TableRef = Readonly<{
  name: string;
  schema?: string;
  alias?: string;
  /** Only rendered where the table is a FROM source. */
  sample?: TableSample;
}>;

export type SubquerySource = Readonly<{ subquery: QueryNode; alias: string; lateral?: boolean }>;

/** `(VALUES (...), ...) AS alias(columns)`. */
export type ValuesSource = Readonly<{
  values: readonly (readonly ExprNode[])[];
  alias: string;
  columns: readonly string[];
}>;

/** `fn(args) [WITH ORDINALITY] AS alias[(columns)]`; `function` is the identifier path of the name. */
export type FunctionSource = Readonly<{
  function: readonly string[];
  args: readonly ExprNode[];
  alias: string;
  columns?: readonly string[];
  /** Name of the ordinality column, which `columns` must list last. */
  ordinality?: string;
}>;

/** One column of `JSON_TABLE`; `path` is an already escaped SQL string literal. */
export type JsonTableColumn =
  | Readonly<{ name: string; kind: 'ordinality' }>
  | Readonly<{ name: string; kind: 'value' | 'exists'; type: string; path?: string }>;

/** `JSON_TABLE(doc, path COLUMNS (...)) AS alias` (PostgreSQL 17+); `path` is an escaped literal. */
export type JsonTableSource = Readonly<{
  jsonTable: Readonly<{ doc: ExprNode; path: string; columns: readonly JsonTableColumn[] }>;
  alias: string;
}>;

export type JoinNode = Readonly<{
  type: 'INNER' | 'LEFT OUTER' | 'RIGHT OUTER';
  table: FromItem;
  on: ExprNode;
  /** Joins written inside the parentheses of this join: `LEFT JOIN (table INNER JOIN ...) ON ...`. */
  nested?: readonly JoinNode[];
}>;

export type FromItem = TableRef | SubquerySource | ValuesSource | FunctionSource | JsonTableSource;

export type LockNode = Readonly<{
  strength: 'UPDATE' | 'NO KEY UPDATE' | 'SHARE' | 'KEY SHARE';
  of?: readonly string[];
  wait?: 'NOWAIT' | 'SKIP LOCKED';
}>;

export type SetOperator = 'UNION' | 'INTERSECT' | 'EXCEPT';

/** `left UNION | INTERSECT | EXCEPT [ALL] right`. */
export type SetOperationNode = Readonly<{
  kind: 'setop';
  op: SetOperator;
  all: boolean;
  left: QueryNode;
  right: QueryNode;
}>;

/** `SEARCH { BREADTH | DEPTH } FIRST BY columns SET column` of a recursive CTE. */
export type CteSearch = Readonly<{
  mode: 'BREADTH' | 'DEPTH';
  by: readonly string[];
  set: string;
}>;

/** `CYCLE columns SET column [USING path]` of a recursive CTE. */
export type CteCycle = Readonly<{ columns: readonly string[]; set: string; using: string }>;

export type CteNode = Readonly<{
  name: string;
  /** A query, or (non-recursive only) a data-modifying statement with RETURNING. */
  query: QueryNode | ModifyingNode;
  materialized?: boolean;
  search?: CteSearch;
  cycle?: CteCycle;
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
