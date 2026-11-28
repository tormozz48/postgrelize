# ADR-039: Model-less queries and explicit joins over FROM sources

Status: Accepted (2026-11-28)

## Context

Applications keep raw SQL where the FROM clause is not a model: `unnest`, `generate_series`,
`jsonb_array_elements`, `VALUES`, `LATERAL`. The `from` option (ADR-024) already builds these sources,
but only comma-joined next to a model table, so they cannot be the main source, the SELECT of
`insertFrom`, or the target of a `LEFT JOIN ... ON`.

## Decision

- `sequelize.select(options)` runs, and `sequelize.subquery(options)` embeds, a SELECT without a
  model. `from` is the same `FromSourceOption` record; the first entry is the main source, the rest
  are comma-joined. Rows are plain objects. No scope, paranoid filter or hook applies.
- `joins`, keyed by alias, on those methods and on `findAll` / `findOne` / `count` / `subquery`:
  `{ source, type: 'inner' | 'left', on }`; `on` omitted is `ON true`. `LATERAL` is the existing
  `{ lateral: subquery }` source.
- `joins` with an eager `include` is rejected; `separate` includes are not affected.

## Rejected

- A fake model per source: needs attribute definitions, and default scopes / paranoid filters leak
  into the query.
- `include` for ad hoc sources: include shapes result objects by association; sources have none.

## Consequences

Join `on` cannot reference comma-joined `from` entries (PostgreSQL precedence). Join type is
allowlisted; aliases and column names are quoted; values stay bound.
