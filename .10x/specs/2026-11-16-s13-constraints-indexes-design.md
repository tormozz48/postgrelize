# S13: Constraints and indexes — design

**Date:** 2026-11-16 · **Stage:** backlog 4 / S13 · **ADR:** [026](../adrs/026-constraint-index-partition-options.md)

## Scope
Matrix rows `planned` in the DDL area: expression indexes, EXCLUDE constraints, NOT VALID + VALIDATE CONSTRAINT, PG18 NOT ENFORCED / WITHOUT OVERLAPS / FK PERIOD, declarative partitioning. New options and methods only; v6 option shapes and defaults do not change.

## PR order (one topic each)
1. **Expression indexes** (shared index-element renderer): `IndexField` gains `{ expression, collate?, operator?, order?, nulls? }`; plain fields gain `nulls`. Default index name needs a column name, so an expression field requires an explicit `name`.
2. **EXCLUDE + NOT VALID**: `addConstraint({ type: 'exclude', using, exclude: [{ column | expression, with, operator?, collate?, order?, nulls? }], where, include, deferrable })`; `notValid` on check / foreign key; `QueryInterface.validateConstraint(table, name)`.
3. **PostgreSQL 18 forms**: `enforced: false` (check, foreign key), `withoutOverlaps` (unique, primary key: last field), `period` (foreign key: last field and last referenced field). Version gated (`minimumServerVersion` 18, `describe.skipIf`).
4. **Partitioning**: `createTable` option `partitionBy: { strategy, columns }`; `createPartition(parent, name, { bound, partitionBy })`, `attachPartition`, `detachPartition({ concurrently, finalize })`. Bounds: `{ in: [...] }` (list), `{ from, to }` (range, `PartitionBound.MINVALUE/MAXVALUE`), `{ modulus, remainder }` (hash), `{ default: true }`.

## Safety (ADR-020)
- Identifiers (constraint, index, table, partition, column names, collations) through `quoteIdent`.
- Allowlists: partition strategy, index method (identifier word), operator class (word), EXCLUDE operator (operator-character pattern, no comment openers), nulls ordering, bound keywords.
- Bound values are literals via `SqlLiteral` (ADR-010).
- Trusted SQL (raw by design, on `docs/security.md`): index/EXCLUDE `expression` strings and partition key `expression` strings. Where-objects for predicates compile like partial indexes.

## Introspection
`showIndex` does not exist in this package; `describeTable`, `showAllTables` and `sync` are schema-filtered already. Partitions are real tables, listed by `showAllTables`. Tests verify partitioned parent and partitions are visible and that `sync` leaves them alone.

## Tests
Unit (generated DDL), integration on real PostgreSQL (EXCLUDE needs `btree_gist` for scalar equality), PG18 features gated, security payloads per new input, docs example regions executed. No compat tests: v6 has none of these features.
