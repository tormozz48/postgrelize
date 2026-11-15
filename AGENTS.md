# AGENTS.md — working on postgrelize

Rules for anyone continuing this package, human or AI agent. Read it fully before the first change. When a rule here conflicts with an older note in `.10x/`, this file and the newest ADR win. If you change a rule, update this file in the same PR.

## What this is

`@tormozz48/postgrelize`: a PostgreSQL-only ORM, a drop-in replacement for the Sequelize v6 public API (reference 6.37.x), written from scratch in TypeScript. PostgreSQL features (ON CONFLICT, MERGE, RETURNING old, CTEs, COPY, LISTEN/NOTIFY, advisory locks, read replicas, …) are added as **new** options and methods. They never change v6 semantics.

- Docs site: https://tormozz48.github.io/postgrelize/ (VitePress guide + TypeDoc API + coverage report)
- Package: GitHub Packages, `npm i @tormozz48/postgrelize`
- Supported: Node ≥ 20, PostgreSQL 16/17/18, `pg` ^8 (peer dependency)

## Golden rules

1. **The v6 API is a contract.** Public names, option shapes, return values, error classes and hook order match Sequelize v6. Divergence is allowed only to fix a v6 bug ([ADR-016](.10x/adrs/016-v6-bug-divergence.md)), and every divergence is documented.
2. **Values are always bound.** DML uses `$1..$n` parameters only ([ADR-002](.10x/adrs/002-pg-driver-bound-parameters.md)). DDL renders literals through `SqlLiteral` only ([ADR-010](.10x/adrs/010-ddl-literals.md)). Identifiers are always quoted by the shared quoting helper. Enum-like strings (lock strengths, isolation levels, function names, types) go through an allowlist. Never concatenate user input into SQL. Every input that reaches SQL has a row on the Security page and tests in `tests/integration/security/` ([ADR-020](.10x/adrs/020-injection-assurance.md)).
3. **Only `src/connection` imports `pg`.** No new runtime dependencies without an ADR. Current runtime deps: `inflection`, `validator`.
4. **No change without a test that needs it** (YAGNI). Every bug fix gets a regression test.
5. **Docs move with code.** A PR that changes behaviour updates its docs in the same PR (see [Documentation sync](#documentation-sync)).
6. **Decisions are written down.** Architecture-level choices get an ADR before implementation (see [Decision records](#decision-records)).
7. **Verify, don't assume.** Run the checks and read their exit codes before saying something works. Merge only after CI is green.

## Setup and commands

```bash
npm ci
npm run db:up          # PostgreSQL in Docker on localhost:54329 (PGZ_PG_VERSION=17 to switch)
npm run lint           # oxlint, must exit 0 (warnings allowed, errors not)
npm run format:check   # oxfmt; `npm run format` to fix
npm run typecheck      # tsc --noEmit, strict
npm test               # unit + integration + compat (vs sequelize@6) + docs examples
npm run build && npm run test:build
npm run llm:build      # regenerate llm/USAGE.md and skills/ (a docs test fails when stale)
npm run docs           # TypeDoc + VitePress build + llms.txt / llms-full.txt; fails on undocumented public exports
npm run docs:dev       # preview the site
npm run test:coverage  # coverage + badge
```

`PGZ_TEST_URL` overrides the server URL. Tests create their own databases on that server (`CREATE DATABASE` rights required) and drop them afterwards.

Performance gate (run for changes on query building, execution or row mapping):

```bash
PGZ_BENCH_STUB=1 PGZ_BENCH_JSON=/tmp/b1.json npm run bench   # repeat 3× (b1, b2, b3)
node bench/compare.ts /tmp/b1.json /tmp/b2.json /tmp/b3.json
```

Gated cases must stay within +10% of `bench/baseline.json`. Update the baseline only on purpose, in its own commit, with the reason in the message.

Every bench case also runs on Sequelize v6 (interleaved, CPU time) and `compare.ts` prints the v6 / postgrelize ratio; on a loaded machine trust the ratio, not absolute µs. Database mode: omit `PGZ_BENCH_STUB`. Profile one case: `npm run build && node --cpu-prof --cpu-prof-dir=/tmp/prof bench/profile.ts "findAll 100 rows"`, then `node bench/profile-summary.ts <file>.cpuprofile` (see `.10x/specs/2026-11-15-s10-performance-design.md`).

## Repository map

| Path                                                 | Contents                                                                                                                                       |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/index.ts`                                       | The only public entry point. Every export is public API.                                                                                       |
| `src/sequelize.ts`, `src/model/`                     | `Sequelize` and `Model` facades; query builders; `operations/*` (Find, Create, Upsert, …)                                                      |
| `src/sql/`                                           | SQL AST types and `SqlCompiler` (AST → `{ text, values }`)                                                                                     |
| `src/where/`, `src/expressions/`                     | `WhereCompiler`, `Op`, expression classes (`literal`, `fn`, `col`, …)                                                                          |
| `src/associations/`                                  | Association classes, include resolution/loading, nested creation                                                                               |
| `src/decorators/`                                    | Public model decorators and `addModels` applier (metadata store, both signatures)                                                              |
| `src/data-types/`, `src/validation/`, `src/hooks/`   | DataTypes, validators, hook registry                                                                                                           |
| `src/ddl/`, `src/query-interface/`                   | DDL generation, `QueryInterface`, `sync`                                                                                                       |
| `src/connection/`, `src/transaction/`, `src/errors/` | Pool, replicas, COPY, LISTEN/NOTIFY, transactions, error mapping                                                                               |
| `tests/unit`                                         | No database. Mirrors `src` paths.                                                                                                              |
| `tests/integration`                                  | Real PostgreSQL. postgrelize-only behaviour and v6-bug regressions.                                                                            |
| `tests/compat`                                       | Differential: the same scenario on sequelize@6 and postgrelize, results must be equal.                                                         |
| `tests/docs`                                         | Runs every `docs/examples/*.ts`.                                                                                                               |
| `docs/guide`, `docs/examples`                        | Site guide pages and the runnable examples they include                                                                                        |
| `docs/api`                                           | Generated by TypeDoc. Do not edit by hand.                                                                                                     |
| `docs/llm`, `llm/`, `skills/`                        | LLM usage guide and Agent Skill: templates in `docs/llm`, generated outputs in `llm/` and `skills/` (do not edit by hand; `npm run llm:build`) |
| `bench/`                                             | Benchmark and the performance gate                                                                                                             |
| `.10x/`                                              | ADRs, specs, role decisions, reviews, status: the project's memory                                                                             |

## Architecture rules

Current architecture: [ADR-018](.10x/adrs/018-oop-architecture.md), refined by [ADR-021](.10x/adrs/021-decorators-mixins-size-limits.md) (decorators, mixins, size limits). It supersedes the functional style of [ADR-005](.10x/adrs/005-functional-core-class-shell.md) and the Effect core of [ADR-017](.10x/adrs/017-effect-core.md). Do not reintroduce either.

- Behaviour lives in **classes with one responsibility** and constructor-injected collaborators. `Model` and `Sequelize` are facades that delegate.
- **Plain data stays plain**: SQL AST node shapes, option bags, `Op`, constant tables (`HOOK_TYPES`, `ISOLATION_LEVELS`, …) are types and frozen objects, not classes.
- **No exported free functions in `src/`**, except the v6 helpers Sequelize itself exposes as functions (`literal`, `fn`, `col`, `cast`, `json`, `where`, …). These are thin factories that return class instances.
- No static-only classes (oxlint `no-extraneous-class`). No TypeScript parameter properties. No default exports. No import cycles.
- **Decorators** are TC39 standard decorators (no `experimentalDecorators`), written on their own line. `build/decorators-plugin.ts` lowers them for the build and every Vitest project; Node cannot run them directly, so run TypeScript through Vitest (`npm run bench`, tests), not `node --experimental-strip-types`. Public model decorators (`@Table`, `@Column`, associations, hooks) live in `src/decorators/` ([ADR-022](.10x/adrs/022-public-decorator-api.md)): they only record metadata, `sequelize.addModels` applies it through `Model.init` and the association methods; every public decorator accepts both TC39 and legacy call signatures through `DecoratorSignature`. Legacy mode is tested by `npx vitest run --project decorators-legacy`. Use internal decorators only for cross-cutting concerns that would otherwise repeat (hooks around operations, transaction scope, logging, memoization), never on hot paths that fail the bench gate. Public decorators accept both TC39 and legacy call signatures.
- **Mixins** (`<TBase extends Constructor>(Base: TBase) => class extends Base { … }`) compose classes with several independent capabilities (e.g. `Model`). Each mixin is a named factory with TSDoc on its members.
  - `Model` = `ModelBase` + static mixins in `src/model/mixins/` (associations, schema, hooks, scopes, finders, aggregates, writers, PostgreSQL extensions). Instance methods need the class type parameters, so they live in `ModelInstanceValues` / `ModelInstancePersistence`, merged into `interface Model` and copied onto the prototype.
  - A mixin factory line carries `// oxlint-disable-next-line max-lines-per-function, typescript/explicit-module-boundary-types` (its body is the class; methods are still checked; the type can only be inferred).
  - Mixin base classes have no `#private` fields and public types with symbol keys are interfaces: otherwise declaration files cannot name the mixin types. `tests/build/declarations.test.ts` type-checks `dist` in a strict consumer.
- Expression classes are recognised across package copies through the `Symbol.for('postgrelize.expression')` kind tag. A new expression class sets `static override readonly kind`.
- Async code uses async/await. Resources (pooled clients, transactions) are released in `try/finally` inside the class that owns them (`ConnectionManager`, `TransactionRunner`).
- AST nodes are discriminated unions; switches over them are exhaustive with a `never` check.
- Errors that reach users are v6 error classes (mapped by `PgErrorMapper`). Plain `Error` is only for programmer mistakes.
- Introspection SQL always filters by schema (`table_schema`, `nspname`). Name-only catalog lookups are a known v6 bug class.

Feature-specific designs: eager loading [ADR-009](.10x/adrs/009-eager-loading-join-strategy.md), lifecycle and validation [ADR-008](.10x/adrs/008-model-lifecycle-validation.md), `onConflict` / `Model.insert` [ADR-003](.10x/adrs/003-on-conflict-extension-api.md), subqueries [ADR-011](.10x/adrs/011-subquery-expressions.md), connection features [ADR-012](.10x/adrs/012-connection-features.md), CTE and COPY TO [ADR-013](.10x/adrs/013-cte-and-copy-to.md), replicas [ADR-014](.10x/adrs/014-replica-routing.md), RETURNING old and include scopes [ADR-015](.10x/adrs/015-returning-old-include-scopes.md).

## Code style

- TypeScript `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `verbatimModuleSyntax`. No `any` (use `unknown`); `any` only where v6's own types require it.
- Exported functions and methods have explicit parameter and return types.
- Files are `kebab-case.ts`; classes and types `PascalCase`; functions and members `camelCase`. Imports are relative inside `src`, with no barrels except `src/index.ts`.
- **Size limits** (oxlint, `src/**`, code lines without comments and blank lines): functions ≤ 20 lines, files ≤ 150 lines. Files still above the limits are listed in the `.oxlintrc.json` overrides; the list only shrinks (`tests/unit/build/size-ratchet.test.ts`). When you split a listed file, remove it from the list and lower the numbers in that test. Never add a file to the list.
- Comments explain _why_, never _what_. TSDoc is for the public API (see [API documentation](#api-documentation)).
- Match the surrounding style. Do not reformat or refactor unrelated code in a feature PR.

## Testing rules

- **Where a test goes:**
  - Pure logic goes to `tests/unit`.
  - Anything v6 also does goes to `tests/compat` (differential) ([ADR-004](.10x/adrs/004-differential-compat-testing.md)). Compatibility is claimed only for covered scenarios.
  - PostgreSQL-only features and fixed v6 bugs go to `tests/integration`. Fixed v6 bugs go to `tests/integration/sequelize-issues.test.ts`.
- A differential test never encodes a v6 bug as the expected result. If v6 is wrong, narrow the scenario or move it to the integration suite ([ADR-016](.10x/adrs/016-v6-bug-divergence.md)).
- **Isolation:**
  - Each DB test runs in its own schema via `withSchema` / `runScenario`.
  - Each test project gets its own database per run, and each compat file its own database (`tests/support/global-setup-db.ts`, `tests/support/file-database.ts`).
  - Get the URL from `testDatabaseUrl()`, never hard-code it.
  - Database-wide names (LISTEN channels, advisory lock keys) are safe only because of these per-run databases. Don't share them between files of one project.
- **Security tests** (`tests/integration/security/`) run on real PostgreSQL inside `withCanary` (from `tests/support/injection.ts`): use the `PAYLOADS` corpus and `fast-check` properties (`textValue()`, `identifier()`, `propertyParameters()`, fixed seed; reproduce with `PGZ_FC_SEED`). A `42601` syntax error means a payload escaped its quoting.
- **Coverage** is enforced in CI (`npm run test:coverage` fails below 98% lines/statements/functions and 90% branches). New code arrives with tests that assert its behaviour; code that the public API cannot reach is removed, not tested artificially. `it.fails` marks a known bug or v6 difference with a `TODO(parity)` comment: when the bug is fixed the test turns red, flip it to `it` and update the docs. Findings: `.10x/reviews/2026-11-15-coverage-findings.md`.
- **No timing assumptions.** Don't rely on "X finishes within N ms". Order concurrent steps with explicit signals (resolve a promise when the lock is held, then start the competitor).
- The suite must pass when run several times in parallel on one machine. If you see a flake, find the cause; don't retry or raise timeouts to hide it.

## Documentation sync

Docs live in four places. Each one is either checked by a tool or covered by a rule below.

| Source of truth                                            | Published as                                                                                          | Kept in sync by                                                                                             |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| TSDoc on exports of `src/index.ts`                         | `docs/api` (TypeDoc)                                                                                  | `npm run docs` fails on undocumented exports; `tests/docs/tsdoc-examples.test.ts` checks examples           |
| `docs/examples/*.ts`                                       | code blocks in `docs/guide/*.md` via `<<< @/examples/<file>.ts#<region>{ts}`                          | the `docs` test project runs every example and checks its results                                           |
| `docs/coverage/postgresql-features.ts`                     | the "PostgreSQL coverage" page                                                                        | `tests/docs/postgresql-matrix.test.ts` checks every `supported` row's test reference                        |
| `docs/guide/*.md`, `docs/sequelize-issues.md`, `README.md` | the site and the repo front page                                                                      | this table + the PR checklist (manual)                                                                      |
| `docs/llm/**` templates + `docs/examples/llm-usage.ts`     | `llm/USAGE.md`, `skills/postgrelize/**` (in the npm package), `llms.txt`, `llms-full.txt` on the site | `npm run llm:build`; `tests/docs/llm-docs.test.ts` fails on stale files; examples run in the `docs` project |
| `.10x/` (ADRs, specs, decisions, status)                   | repo only                                                                                             | this file's [Decision records](#decision-records) rules                                                     |

**When you change X, update Y in the same PR:**

| Change                                               | Must update                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public API or behaviour change                       | The matching region in `docs/examples/llm-usage.ts` (or the example the cheat sheet includes) and `npm run llm:build` to regenerate `llm/USAGE.md` and `skills/postgrelize/**` when the cheat sheet is affected; `docs/llm/*` templates for prose (a docs test fails on stale generated files) |
| New or changed public export / option                | TSDoc (`@param`, `@returns`, `@throws`, `@example` for non-trivial API); the guide page for that area; an example region in `docs/examples` if users need code to use it                                                                                                                       |
| New PostgreSQL feature                               | Everything above, plus the "What you get on top of Sequelize v6" list in `README.md`, the PostgreSQL features section of the guide, and its row in `docs/coverage/postgresql-features.ts` (flip or add it, with a `test` reference)                                                            |
| New guide page                                       | `docs/.vitepress/config.ts` sidebar (`guide` array)                                                                                                                                                                                                                                            |
| Fixed v6 bug (divergence)                            | A row in `docs/sequelize-issues.md` → "Bugs fixed in postgrelize" + a regression test in `tests/integration/sequelize-issues.test.ts`                                                                                                                                                          |
| New input that reaches SQL (option, method argument) | A row in the table on `docs/security.md` + payload test (and property test if bound / identifier) in `tests/integration/security/`                                                                                                                                                             |
| v6 parity fix                                        | Differential test in `tests/compat`; `docs/sequelize-issues.md` if it was a listed issue                                                                                                                                                                                                       |
| Behaviour change visible to users                    | The affected guide pages and examples; `docs/guide/migrating.md` if it affects people moving from v6                                                                                                                                                                                           |
| Breaking change                                      | All of the above + a `!` commit (`feat!:` / `refactor!:`) + a minor version bump while < 1.0                                                                                                                                                                                                   |
| Architecture or dependency decision                  | New ADR; `AGENTS.md` if a rule changes                                                                                                                                                                                                                                                         |
| Dev workflow, scripts, CI                            | `AGENTS.md` (Setup and commands) and the README "Development" section                                                                                                                                                                                                                          |

**Rules for writing docs:**

- New code in the guide comes from a `docs/examples/*.ts` region, so it is type-checked and executed. Don't add untested inline `ts` blocks; when touching a page that has one, move it into an example.
- An example exports `run(sequelize)`. It checks its own results and throws on unexpected output. It may export `minimumServerVersion` for features of newer PostgreSQL.
- Don't edit `docs/api`; it is generated.
- Docs describe the released behaviour on `main`. Never describe planned features as if they exist.
- Every rule in the "Must update" table also appears in the PR checklist (`.github/pull_request_template.md`). Reviewers block PRs that skip an item.

## API documentation

The API reference (`docs/api`, generated by TypeDoc from TSDoc) is read by people and by LLMs. Write it for a reader who sees only that page.

- **Everything public is documented:** every export of `src/index.ts` and everything reachable from it — classes, constructors, methods, properties and fields, functions, type aliases, interfaces and their members, enum-like constants and their members, variables. `@internal` marks what is exported between modules but is not public; it is excluded from the reference.
- **Each comment contains:**
  - a first sentence that says what the item does or represents, without repeating its name;
  - then what matters for using it: units, defaults, `null`/`undefined` meaning, side effects (queries run, hooks fired, transactions used), PostgreSQL version requirements, differences from Sequelize v6;
  - `@param` for every parameter and `@returns` for non-void;
  - `@throws` for the v6 error classes it can raise;
  - `@defaultValue` for options with defaults;
  - `@see` links to related API (`{@link Model.findAll}`) and guide pages;
  - `@deprecated` with the replacement.
- **Examples:** every public function, method and class has at least one `@example` with a complete, realistic TypeScript snippet (imports omitted, model names from the guide), unless the item is trivial (simple getters, constants whose description is the value). Options types show an example object. Examples must compile against the current API; when you change a signature, update its examples in the same commit.
- **Enforced by tests and the docs build:**
  - `npm run docs` (TypeDoc, `typedoc.json` `requiredToBeDocumented` + `treatWarningsAsErrors`) fails on any public class, constructor, function, method, property, accessor, interface, type alias, variable or enum member without a comment.
  - `tests/docs/tsdoc-examples.test.ts` (in `npm test`, project `docs`) reads the TypeDoc model and fails when a public item has no summary, only repeats its name, lacks `@param` for a parameter or `@returns` for a non-void result, or when a class, function, method or `*Options` type has no `@example`.
  - The same test type-checks every `@example` with the TypeScript API (nothing is executed). Each snippet is the body of an `async` function after a prelude that imports every public export and declares `sequelize`, `queryInterface`, `transaction`, `user`, `users`, `post` and the models `User`, `Post`, `Profile`, `Tag`, `Product`, `Project`, `Task`, `Invoice` (untyped `Model<any, any>`; see `tests/docs/support/example-compiler.ts`). Write snippets without imports, define any other helper inside the snippet, and put decorators inside a class.
  - Trivial items (simple getters, constants whose description is the value) may skip `@example` only through `tests/docs/tsdoc-example-allowlist.json`: `{ "name": "Class.member", "reason": "…" }`. An entry for an item that has an example, or no longer exists, fails the test. Keep the list short.
- **Kept current:** a PR that changes a public signature, option, default or behaviour updates the TSDoc in the same PR (see [Documentation sync](#documentation-sync)). `npm run docs` fails on undocumented public items; reviewers check that existing comments still match the code.

## Decision records

Everything lives in `.10x/`:

- `adrs/NNN-title.md`: Architecture Decision Records. Write one **before** implementing:
  - a new subsystem or dependency;
  - a change to public API conventions;
  - a deliberate v6 divergence class;
  - anything costly to reverse.

  An ADR has context, decision, at least one rejected alternative, and consequences. Accepted ADRs are immutable: to change a decision, write a new ADR that says "supersedes ADR-NNN", and add "Superseded by ADR-MMM" to the old one's status line.

- `specs/YYYY-MM-DD-topic-design.md`: the approved design for a feature or backlog stage.
- `decisions/<role>/<feature>.md`: per-role notes: what was built, deviations, test results, release records. Append; don't rewrite history.
- `reviews/`: audits (e.g. the Sequelize issues review).
- `status.md`: current phase and open items. `handoff.md`: context for whoever picks up next.

### ADR index

| ADR                                                     | Decision                                                     | Status                                                |
| ------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------- |
| [001](.10x/adrs/001-clean-room-typescript-v6-dropin.md) | Clean-room TypeScript, Sequelize v6 drop-in, PostgreSQL only | Accepted                                              |
| [002](.10x/adrs/002-pg-driver-bound-parameters.md)      | `pg` driver, always-bound parameters                         | Accepted                                              |
| [003](.10x/adrs/003-on-conflict-extension-api.md)       | `onConflict` option and `Model.insert()`                     | Accepted                                              |
| [004](.10x/adrs/004-differential-compat-testing.md)     | Differential testing against sequelize@6                     | Accepted                                              |
| [005](.10x/adrs/005-functional-core-class-shell.md)     | Functional core, thin class shell                            | Superseded by 018                                     |
| [006](.10x/adrs/006-ci-cd-github-actions-packages.md)   | CI/CD on GitHub Actions, GitHub Packages                     | Accepted                                              |
| [007](.10x/adrs/007-typed-public-api-typedoc-pages.md)  | Typed public API, mandatory TSDoc, docs on Pages             | Accepted (site moved to VitePress + TypeDoc markdown) |
| [008](.10x/adrs/008-model-lifecycle-validation.md)      | Hook pipeline, validator.js + Standard Schema                | Accepted                                              |
| [009](.10x/adrs/009-eager-loading-join-strategy.md)     | Eager loading via v6 JOIN strategy                           | Accepted                                              |
| [010](.10x/adrs/010-ddl-literals.md)                    | DDL with escaped literals                                    | Accepted                                              |
| [011](.10x/adrs/011-subquery-expressions.md)            | Subqueries as expressions                                    | Accepted                                              |
| [012](.10x/adrs/012-connection-features.md)             | Connection features without extra deps                       | Accepted                                              |
| [013](.10x/adrs/013-cte-and-copy-to.md)                 | CTE options, COPY TO                                         | Accepted                                              |
| [014](.10x/adrs/014-replica-routing.md)                 | Read replica routing                                         | Accepted                                              |
| [015](.10x/adrs/015-returning-old-include-scopes.md)    | `returningOld`, scopes of includes                           | Accepted                                              |
| [016](.10x/adrs/016-v6-bug-divergence.md)               | Fix inherited v6 bugs by default                             | Accepted                                              |
| [017](.10x/adrs/017-effect-core.md)                     | Effect as internal effect system                             | Superseded by 018                                     |
| [018](.10x/adrs/018-oop-architecture.md)                | OOP architecture, no Effect                                  | Accepted                                              |
| [019](.10x/adrs/019-documentation-sync.md)              | `AGENTS.md` and documentation sync rules                     | Accepted                                              |
| [020](.10x/adrs/020-injection-assurance.md)             | SQL-injection assurance policy                               | Accepted                                              |
| [021](.10x/adrs/021-decorators-mixins-size-limits.md)   | TC39 decorators, mixins, size limits                         | Accepted                                              |
| [022](.10x/adrs/022-public-decorator-api.md)            | Public model decorator API, `sequelize.addModels`            | Accepted                                              |

## Git, PRs and releases

- Branch from `main`: `feat/…`, `fix/…`, `refactor/…`, `docs/…`, `test/…`, `chore/…`. Never commit to `main` directly, except the release commit.
- Conventional Commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`, plus `!` for breaking changes. State-only commits in `.10x/` use `state(<phase>): …`.
- One topic per PR. Fill in the PR template checklist.
- CI (`ci.yml`) runs on every PR: lint, format, typecheck, unit tests, build and package smoke test on Node 20 and 22 (docs build on 22), plus DB tests on PostgreSQL 16, 17 and 18. Merge only when all checks are green (merge commit, `gh pr merge --merge`). Never chain the merge after a CI wait without reading the result.
- **Releases need the maintainer's explicit approval.** Flow:
  1. `npm version X.Y.Z --no-git-tag-version`.
  2. Commit `chore(release): X.Y.Z` on `main`.
  3. Tag `vX.Y.Z` and push the tag. `release.yml` re-runs the checks and publishes to GitHub Packages.
  4. Record the release in `.10x` (`state(delivery): record X.Y.Z release`) via a PR.
- Semver while < 1.0: breaking change → minor bump, everything else → patch.
- `docs.yml` deploys the site from `main` on every push.
