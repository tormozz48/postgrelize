# Transactions and sessions

## Managed and unmanaged

<<< @/examples/transactions.ts#managed{ts}

<<< @/examples/transactions.ts#unmanaged{ts}

## Savepoints

<<< @/examples/transactions.ts#savepoints{ts}

## Row locks

<<< @/examples/transactions.ts#locking{ts}

## CLS

<<< @/examples/llm-usage.ts#cls{ts}

## Settings, LISTEN/NOTIFY, advisory locks

<<< @/examples/sessions.ts#settings{ts}

<<< @/examples/sessions.ts#listen-notify{ts}

<<< @/examples/sessions.ts#advisory-locks{ts}

Read replicas: `new Sequelize({ replication: { read: [...], write } })` routes reads to replicas; see <https://tormozz48.github.io/postgrelize/guide/sessions>.
