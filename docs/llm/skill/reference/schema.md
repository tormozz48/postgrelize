# Models and schema

## Class and init

<<< @/examples/llm-usage.ts#define-class{ts}

## define

<<< @/examples/llm-usage.ts#define-fn{ts}

## Decorators

<<< @/examples/llm-usage.ts#decorators{ts}

## PostgreSQL column types

<<< @/examples/models.ts#postgres-columns{ts}

## sync

<<< @/examples/schema.ts#sync{ts}

`sync()` creates missing tables, `{ alter: true }` adjusts columns, `{ force: true }` drops first. Use it for tests and prototypes.

## Migrations with QueryInterface

<<< @/examples/schema.ts#migration{ts}
