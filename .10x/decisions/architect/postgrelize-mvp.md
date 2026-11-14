# Architect — postgrelize-mvp

## Components (dependency direction: down only)
| Module | Responsibility | Pure? | Depends on |
|---|---|---|---|
| `sql/ast.ts` | AST node types (readonly discriminated unions) | yes | — |
| `sql/compile.ts` | AST → `{ text, values }`; quoting; param numbering | yes | ast |
| `expressions/` | `literal`, `fn`, `col`, `cast`, `where`, `json`, `excluded`, `Op` → AST | yes | ast |
| `where/` | v6 where object → AST condition | yes | expressions, model-definition |
| `data-types/` | DataType descriptors (sql type, parse, serialize, validate) | yes | — |
| `errors/` | v6 error classes + `mapPgError` | mapping pure | — |
| `model-definition/` | normalize `init(attributes, options)` → immutable `ModelDefinition` (fields, PK, timestamps, table name) | yes | data-types |
| `query/` | operation builders: `buildSelect`, `buildInsert`, `buildUpdate`, `buildDelete`, `buildOnConflict` (options + definition → AST) | yes | where, model-definition, ast |
| `rows/` | rows → attribute values (field→attr, parse types) | yes | model-definition |
| `connection/` | pg.Pool lifecycle, `Executor` function | effects | pg, errors |
| `transaction/` | tx lifecycle, savepoints, CLS (AsyncLocalStorage) | effects | connection |
| `model/` | `Model` class shell: statics/instance methods delegating to query/rows + executor | shell | all above |
| `sequelize.ts` | `Sequelize` class shell: config, registry, `query`, `transaction` | shell | connection, transaction, model |
| `index.ts` | public exports | — | — |

## Data flow
options → normalize (pure) → build AST (pure) → compile (pure) → execute (effect) → map rows (pure) → construct instances (shell).

## Key interfaces
```ts
type CompiledQuery = { readonly text: string; readonly values: readonly unknown[] };
type Executor = (q: CompiledQuery) => Promise<QueryResult>;   // injected
type ModelDefinition = Readonly<{ name; tableName; schema?; attributes: ReadonlyMap<string, AttributeDef>; primaryKeys; timestamps; ... }>;
```

## Failure modes
| Failure | Handling |
|---|---|
| Invalid options (unknown attr, bad onConflict) | throw `Error` in normalize/build step, before I/O |
| PG error | `mapPgError` → v6 error class with `sql`, `parameters`, `parent`, `original` |
| Connection acquire timeout / refused | v6 `ConnectionAcquireTimeoutError` / `ConnectionRefusedError` etc. |
| Error inside managed transaction | rollback, release client, rethrow original |
| Client leak on thrown error | `try/finally` release in executor; tested |
| Param type inference failure | casts emitted for typed attributes; integration tests |

## Trade-offs
- Simplicity over generality: no dialect abstraction (YAGNI).
- Correctness over SQL parity with v6 (bound params).
