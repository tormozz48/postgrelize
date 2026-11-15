## What and why

<!-- One topic per PR. Link the spec / ADR / issue. -->

## Checklist

See [AGENTS.md → Documentation sync](../AGENTS.md#documentation-sync).

- [ ] Tests: unit / compat (v6 behaviour) / integration (PostgreSQL-only, fixed v6 bugs); no timing assumptions
- [ ] `npm run lint`, `format:check`, `typecheck`, `test`, `docs` pass locally
- [ ] Public API: TSDoc updated (`@param`, `@returns`, `@throws`, `@example`)
- [ ] Guide page and `docs/examples` region updated (new guide code comes from an example)
- [ ] New guide page added to the sidebar in `docs/.vitepress/config.ts`
- [ ] Fixed v6 bug: row in `docs/sequelize-issues.md` + test in `tests/integration/sequelize-issues.test.ts`
- [ ] New PostgreSQL feature: README feature list updated
- [ ] Breaking change: `!` in the commit, `docs/guide/migrating.md` updated
- [ ] Architecture or dependency decision: ADR written; `AGENTS.md` updated if a rule changed
- [ ] Hot path touched: `bench/compare.ts` gate run (≤ +10%)
