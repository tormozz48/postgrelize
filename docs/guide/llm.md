# Using postgrelize with LLMs and agents

postgrelize ships documentation in formats that language models and coding agents read well. Pick the one that fits how your agent works. All of them are generated from the same tested code, so they do not drift from the library.

| Format           | Where                                                                  | Use it when                                                                                                                                                   |
| ---------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `llms.txt`       | <https://tormozz48.github.io/postgrelize/llms.txt>                     | the agent browses the web: an index of the guide, reference and API pages                                                                                     |
| `llms-full.txt`  | <https://tormozz48.github.io/postgrelize/llms-full.txt>                | the agent can load one large file: every guide page, the security page, the PostgreSQL coverage matrix, the Sequelize differences and the whole API reference |
| `llm/USAGE.md`   | inside the npm package: `node_modules/postgrelize/llm/USAGE.md`        | the agent sees only your project and `node_modules`: one compact cheat sheet                                                                                  |
| Agent Skill      | inside the npm package: `node_modules/postgrelize/skills/postgrelize/` | the agent supports Skills (Claude Code and compatible tools)                                                                                                  |
| TSDoc in `.d.ts` | `node_modules/postgrelize/dist/*.d.ts`                                 | always: every public item has a description, `@param`, `@throws` and an `@example`                                                                            |

## llms.txt and llms-full.txt

Both follow the [llms.txt convention](https://llmstxt.org): `llms.txt` is a markdown index (title, summary, sections with links and one-line descriptions); `llms-full.txt` is the full text. They are built with the site (`npm run docs`) from `docs/guide`, the reference pages and `docs/api`; code blocks come from `docs/examples` and the coverage matrix from `docs/coverage/postgresql-features.ts`.

Give the URL to your agent, or add it to your project instructions:

```md
For postgrelize usage, read https://tormozz48.github.io/postgrelize/llms-full.txt
```

## USAGE.md in the package

`llm/USAGE.md` covers install, connecting, defining models, CRUD, operators, associations, transactions, hooks, upserts and other PostgreSQL features, schema, errors, the most common mistakes, differences from Sequelize v6, unsupported features and security rules. Reference it from `AGENTS.md` or `CLAUDE.md`:

```md
postgrelize: read node_modules/postgrelize/llm/USAGE.md before writing database code.
```

## Agent Skill

The package contains a ready-made skill: `skills/postgrelize/SKILL.md` with `reference/*.md` files that the agent loads on demand (querying, writing, schema, associations, transactions and sessions, errors, security, migrating from Sequelize, PostgreSQL features).

Install it for Claude Code by copying the folder:

```bash
# project-level (shared with the team through git)
mkdir -p .claude/skills
cp -r node_modules/postgrelize/skills/postgrelize .claude/skills/

# or for all your projects
cp -r node_modules/postgrelize/skills/postgrelize ~/.claude/skills/
```

The skill activates when you write or migrate code that uses postgrelize or Sequelize v6 on PostgreSQL. Other agents that read the same `SKILL.md` format can use the same folder; agents without Skills support can read `SKILL.md` and the reference files directly.

## How the files stay correct

- Every snippet in `USAGE.md` and the skill is a region of a file in `docs/examples`, mostly `docs/examples/llm-usage.ts`. The `docs` test project runs these files against PostgreSQL and fails on unexpected results.
- `npm run llm:build` renders the templates in `docs/llm` into `llm/` and `skills/`; a test fails when the committed files differ from a fresh render.
- The "not supported" lists come from the PostgreSQL coverage matrix.
- When you change public API or behaviour, update the matching region in `docs/examples/llm-usage.ts` and run `npm run llm:build`.
