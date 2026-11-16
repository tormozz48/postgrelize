## What and why

<!-- One topic per PR. Link the spec / ADR / issue. -->

## Checklist

See [AGENTS.md → Documentation sync](../AGENTS.md#documentation-sync).

- [ ] Tests: unit / compat (v6 behaviour) / integration (PostgreSQL-only, fixed v6 bugs); no timing assumptions
- [ ] `npm run lint`, `format:check`, `typecheck`, `test`, `docs` pass locally
- [ ] Public API: TSDoc updated for every changed class, method, field, type, interface and constant (`@param`, `@returns`, `@throws`, `@defaultValue`, `@example`) — every `@example` is type-checked by `tests/docs/tsdoc-examples.test.ts`; see AGENTS.md → API documentation
- [ ] Guide page and `docs/examples` region updated (new guide code comes from an example)
- [ ] Public API or behaviour change: `docs/examples/llm-usage.ts` region updated and `npm run llm:build` run (regenerates `llm/USAGE.md` and `skills/postgrelize/**`)
- [ ] New guide page added to the sidebar in `docs/.vitepress/config.ts`
- [ ] Fixed v6 bug: row in `docs/sequelize-issues.md` + test in `tests/integration/sequelize-issues.test.ts`
- [ ] New PostgreSQL feature: README feature list updated; row in `docs/coverage/postgresql-features.ts` flipped or added with a `test` reference
- [ ] Feature beyond Sequelize v6: `beyondV6`, `example` and `guide` set on its matrix row (or `EXTRA_FEATURES`); the example runs in `tests/docs/examples.test.ts` and the guide section describes the feature and includes it
- [ ] Breaking change: `!` in the commit, `docs/guide/migrating.md` updated
- [ ] Architecture or dependency decision: ADR written; `AGENTS.md` updated if a rule changed
- [ ] New input reaching SQL: row on `docs/security.md` + tests in `tests/integration/security/` (ADR-020)
- [ ] Hot path touched: `bench/compare.ts` gate run (≤ +10%)
