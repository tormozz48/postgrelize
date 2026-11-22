import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type Config = Readonly<{
  repository: string;
  tag: string;
  commit: string;
  dependencies: Readonly<Record<string, string>>;
}>;

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const config = JSON.parse(readFileSync(join(here, 'config.json'), 'utf8')) as Config;

/** Directory that holds the downloaded v6 sources and the prepared test tree (untracked). */
export const WORK = join(root, '.v6-suite');

const run = (command: string, args: readonly string[], cwd: string): string =>
  execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

// Downloaded sources are untrusted: they are read, never built or installed with scripts.
const fetchSources = (): string => {
  const source = join(WORK, 'v6');
  if (!existsSync(source)) {
    mkdirSync(WORK, { recursive: true });
    run(
      'git',
      ['clone', '--quiet', '--depth', '1', '--branch', config.tag, config.repository, source],
      WORK,
    );
  }
  const head = run('git', ['rev-parse', 'HEAD'], source).trim();
  if (head !== config.commit) {
    throw new Error(
      `v6 sources are at ${head}, expected ${config.commit} (${config.tag}); delete ${source}`,
    );
  }
  return source;
};

const patchSupport = (file: string): void => {
  const patches: readonly (readonly [string, string])[] = [
    [
      "const AbstractQueryGenerator = require('sequelize/lib/dialects/abstract/query-generator');",
      'const AbstractQueryGenerator = class {};',
    ],
    [
      'sequelize.modelManager.models = [];',
      'if (sequelize.modelManager) sequelize.modelManager.models = [];',
    ],
    ['if (!queryInterface.queryGenerator._dialect.supports.schemas) {', 'if (false) {'],
  ];
  let text = readFileSync(file, 'utf8');
  for (const [from, to] of patches) {
    if (!text.includes(from)) throw new Error(`test/support.js changed: cannot find ${from}`);
    text = text.replace(from, to);
  }
  writeFileSync(file, text);
};

const fill = (template: string, values: Readonly<Record<string, string>>): string =>
  Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`__${key}__`, value),
    template,
  );

/**
 * Prepares `.v6-suite/work`: a copy of v6's `test/` tree (with three small patches to
 * `test/support.js`), the pinned test dependencies, and the adapter that points `sequelize` at the
 * built postgrelize (`dist/index.cjs`).
 *
 * @returns The prepared directory.
 */
export const prepare = (): string => {
  const entry = join(root, 'dist/index.cjs');
  if (!existsSync(entry)) throw new Error('dist/index.cjs is missing: run `npm run build` first');
  const source = fetchSources();
  const work = join(WORK, 'work');
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  cpSync(join(source, 'test'), join(work, 'test'), { recursive: true });
  patchSupport(join(work, 'test/support.js'));
  // test/support.js lists the dialects by reading ../lib/dialects
  mkdirSync(join(work, 'lib/dialects/postgres'), { recursive: true });
  writeFileSync(
    join(work, 'package.json'),
    JSON.stringify({ name: 'v6-suite', private: true, dependencies: config.dependencies }),
  );
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock'], work);
  const shim = join(work, 'node_modules/sequelize');
  mkdirSync(shim, { recursive: true });
  const adapter = (name: string): string => readFileSync(join(here, 'adapter', name), 'utf8');
  const v6Root = dirname(
    createRequire(join(root, 'package.json')).resolve('sequelize/package.json'),
  );
  const v6Dialect = join(v6Root, 'lib/dialects/postgres');
  writeFileSync(join(shim, 'package.json'), adapter('package.template.json'));
  writeFileSync(
    join(shim, 'index.js'),
    fill(adapter('shim.template.js'), { POSTGRELIZE_ENTRY: entry }),
  );
  writeFileSync(
    join(work, 'register.cjs'),
    fill(adapter('register.template.cjs'), {
      POSTGRELIZE_ENTRY: entry,
      V6_POSTGRES_DIALECT: v6Dialect,
    }),
  );
  cpSync(join(here, 'adapter/reporter.cjs'), join(work, 'reporter.cjs'));
  return work;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(`prepared ${prepare()}`);
}
