# PostgreSQL features

## MERGE (PostgreSQL 17+ for `returning`)

<<< @/examples/merge-returning.ts#merge-returning{ts}

## RETURNING old values (PostgreSQL 18+)

<<< @/examples/returning-old.ts#update{ts}

## Subqueries, EXISTS, DISTINCT ON, window functions

<<< @/examples/advanced-queries.ts#subquery{ts}

<<< @/examples/advanced-queries.ts#exists{ts}

<<< @/examples/advanced-queries.ts#distinct-on{ts}

<<< @/examples/advanced-queries.ts#window{ts}

## CTEs and keyset pagination

<<< @/examples/advanced-queries.ts#cte{ts}

<<< @/examples/advanced-queries.ts#recursive-cte{ts}

<<< @/examples/advanced-queries.ts#keyset{ts}

<<< @/examples/advanced-queries.ts#find-each{ts}

## Not supported

Source of truth: <https://tormozz48.github.io/postgrelize/postgresql-coverage>. Missing features (use `sequelize.query()` raw SQL or `literal()`):

{{unsupported}}
