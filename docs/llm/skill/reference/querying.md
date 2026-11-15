# Querying

<<< @/examples/llm-usage.ts#crud{ts}

## Operators and where

<<< @/examples/llm-usage.ts#operators{ts}

More patterns (JSON paths, `Op.hasKey`, `Op.any`, scopes, aggregates, pagination, raw queries):

<<< @/examples/querying.ts#where{ts}

<<< @/examples/querying.ts#aggregates{ts}

<<< @/examples/querying.ts#scopes{ts}

## Pagination, aggregates, soft deletes

<<< @/examples/llm-usage.ts#query-options{ts}

## Raw queries

<<< @/examples/llm-usage.ts#raw{ts}

Use `replacements` (`:name`, `?`) or `bind` (`$1`). Never interpolate user values into the SQL text.
