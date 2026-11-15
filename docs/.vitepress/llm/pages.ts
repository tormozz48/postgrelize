/** One hand-written documentation page that goes into `llms.txt` and `llms-full.txt`. */
export type DocPage = Readonly<{
  /** Path under `docs/`. */
  file: string;
  /** Site URL path (clean URLs, no base). */
  url: string;
  section: 'Guide' | 'PostgreSQL features' | 'Reference';
  description: string;
}>;

export const SITE = 'https://tormozz48.github.io/postgrelize';

export const PAGES: readonly DocPage[] = [
  { file: 'guide/getting-started.md', url: '/guide/getting-started', section: 'Guide', description: 'Install, connect, define a model, first queries' },
  { file: 'guide/migrating.md', url: '/guide/migrating', section: 'Guide', description: 'Move from Sequelize v6: imports, differences, unsupported features' },
  { file: 'guide/models.md', url: '/guide/models', section: 'Guide', description: 'Model definition with init/define, data types, model options' },
  { file: 'guide/querying.md', url: '/guide/querying', section: 'Guide', description: 'Finders, where operators, pagination, aggregates, scopes, raw queries' },
  { file: 'guide/associations.md', url: '/guide/associations', section: 'Guide', description: 'hasMany/belongsTo/belongsToMany, include, nested creation' },
  { file: 'guide/decorators.md', url: '/guide/decorators', section: 'Guide', description: 'Public decorator API and sequelize.addModels' },
  { file: 'guide/transactions.md', url: '/guide/transactions', section: 'Guide', description: 'Managed/unmanaged transactions, savepoints, CLS, row locks' },
  { file: 'guide/hooks-validation.md', url: '/guide/hooks-validation', section: 'Guide', description: 'Hooks, validators, Standard Schema validation' },
  { file: 'guide/schema.md', url: '/guide/schema', section: 'Guide', description: 'sync, QueryInterface, migrations' },
  { file: 'guide/llm.md', url: '/guide/llm', section: 'Guide', description: 'Using postgrelize from LLMs and agents: llms.txt, USAGE.md, Agent Skill' },
  { file: 'guide/upserts.md', url: '/guide/upserts', section: 'PostgreSQL features', description: 'ON CONFLICT upserts, Model.insert, RETURNING' },
  { file: 'guide/bulk-writes.md', url: '/guide/bulk-writes', section: 'PostgreSQL features', description: 'UPDATE FROM, DELETE USING, INSERT FROM, MERGE, COPY' },
  { file: 'guide/advanced-queries.md', url: '/guide/advanced-queries', section: 'PostgreSQL features', description: 'Subqueries, CTEs, window functions, DISTINCT ON, cursors' },
  { file: 'guide/sessions.md', url: '/guide/sessions', section: 'PostgreSQL features', description: 'LISTEN/NOTIFY, advisory locks, session settings, read replicas' },
  { file: 'postgresql-coverage.md', url: '/postgresql-coverage', section: 'Reference', description: 'Which PostgreSQL features are supported, via literal, planned or out of scope' },
  { file: 'security.md', url: '/security', section: 'Reference', description: 'How every input reaches SQL (bound, identifier, allowlist, literal, raw)' },
  { file: 'sequelize-issues.md', url: '/sequelize-issues', section: 'Reference', description: 'Sequelize v6 bugs fixed in postgrelize and intentional differences' },
];
