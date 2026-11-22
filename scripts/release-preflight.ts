import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { fileURLToPath } from 'node:url';
import {
  atLeast,
  bumpKind,
  changelogProblems,
  ciVerdict,
  compareSemver,
  formatTable,
  parseChangelog,
  parseSemver,
  planSteps,
  requiredBump,
  summaryLines,
} from './release-lib.ts';
import type { CiVerdict, WorkflowRun } from './release-lib.ts';

type Status = 'PASS' | 'FAIL' | 'SKIP' | 'NOTE';
interface PackInfo {
  files: { path: string }[];
  size: number;
}
interface Row {
  name: string;
  status: Status;
  detail: string;
}

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const beforeBump = args.includes('--before-bump');
const fast = args.includes('--fast');
const full = args.includes('--full');
const target = args.find((arg) => !arg.startsWith('--')) ?? '';
const rows: Row[] = [];
let verdict: CiVerdict = { state: 'none', detail: 'CI not checked' };

function sh(program: string, argv: string[], env?: NodeJS.ProcessEnv) {
  const result = spawnSync(program, argv, { cwd: root, encoding: 'utf8', env, maxBuffer: 1 << 28 });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  return { ok: result.status === 0, out: output.trim(), stdout: (result.stdout ?? '').trim() };
}

function gh(argv: string[]) {
  const first = sh('gh', argv);
  if (first.ok || !first.out.includes('Bad credentials')) return first;
  const { GH_TOKEN: _dropped, ...env } = process.env;
  return sh('gh', argv, env);
}

function tail(text: string): string {
  return text.split('\n').slice(-12).join('\n');
}

function record(name: string, status: Status, detail = ''): void {
  rows.push({ name, status, detail });
  console.log(`${status.padEnd(5)} ${name}${detail ? `: ${detail.split('\n')[0]}` : ''}`);
  if (status === 'FAIL' && detail.includes('\n')) console.log(detail.replace(/^/gm, '      '));
}

function check(name: string, run: () => string | void): void {
  try {
    record(name, 'PASS', run() ?? '');
  } catch (error) {
    record(name, 'FAIL', error instanceof Error ? error.message : String(error));
  }
}

function command(name: string, cmd: string, argv: string[], slow = false, skip?: string): void {
  if (skip) return record(name, 'SKIP', skip);
  if (slow && fast) return record(name, 'SKIP', '--fast');
  check(name, () => {
    const result = sh(cmd, argv);
    if (!result.ok) throw new Error(`${cmd} ${argv.join(' ')} failed\n${tail(result.out)}`);
  });
}

function git(...argv: string[]): string {
  const result = sh('git', argv);
  if (!result.ok) throw new Error(`git ${argv.join(' ')}: ${result.out}`);
  return result.stdout;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(`${root}${path}`, 'utf8')) as T;
}

function latestTag(): string {
  const tags = git('tag', '--list', 'v*')
    .split('\n')
    .filter((tag) => parseSemver(tag.slice(1)));
  const sorted = tags.toSorted((a, b) =>
    compareSemver(parseSemver(b.slice(1))!, parseSemver(a.slice(1))!),
  );
  if (!sorted[0]) throw new Error('no v*.*.* tag found');
  return sorted[0];
}

function checkGit(version: string): void {
  const expectedBranch = `chore/release-${version}`;
  check('branch', () => {
    const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
    const onRelease = !beforeBump && branch === expectedBranch;
    if (branch !== 'main' && !onRelease) {
      throw new Error(`on ${branch}; expected main${beforeBump ? '' : ` or ${expectedBranch}`}`);
    }
    return branch;
  });
  check('working tree clean', () => {
    if (git('status', '--porcelain'))
      throw new Error(`uncommitted changes:\n${git('status', '--short')}`);
  });
  check('up to date with origin', () => {
    git('fetch', '--quiet', '--tags', 'origin');
    const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
    const base = 'origin/main';
    if (branch === 'main' && git('rev-parse', 'HEAD') !== git('rev-parse', base)) {
      throw new Error('local main differs from origin/main (pull or push first)');
    }
    const onRelease = branch === expectedBranch && !beforeBump;
    if (onRelease && !sh('git', ['merge-base', '--is-ancestor', base, 'HEAD']).ok) {
      throw new Error('release branch does not contain origin/main (rebase)');
    }
  });
  check(`tag v${version} is free`, () => {
    if (git('tag', '--list', `v${version}`)) throw new Error(`local tag v${version} exists`);
    if (git('ls-remote', '--tags', 'origin', `refs/tags/v${version}`)) {
      throw new Error(`tag v${version} exists on origin`);
    }
  });
}

function checkVersion(version: string, previous: string): void {
  check('version is valid semver, greater than latest tag', () => {
    const next = parseSemver(version);
    if (!next) throw new Error(`"${version}" is not X.Y.Z`);
    const prev = parseSemver(previous)!;
    if (!bumpKind(prev, next)) throw new Error(`${version} is not greater than ${previous}`);
    return `${previous} -> ${version} (${bumpKind(prev, next)})`;
  });
  check('package.json version', () => {
    const actual = readJson<{ version: string }>('package.json').version;
    const expected = beforeBump ? previous : version;
    if (actual !== expected) throw new Error(`package.json is ${actual}; expected ${expected}`);
    return actual;
  });
}

function checkChangelog(version: string, previous: string): void {
  const text = readFileSync(`${root}CHANGELOG.md`, 'utf8');
  check('CHANGELOG.md', () => {
    const problems = changelogProblems(text, version, previous, beforeBump);
    if (problems.length > 0) throw new Error(problems.join('\n'));
  });
  check('bump size matches changelog', () => {
    const prev = parseSemver(previous)!;
    const next = parseSemver(version);
    if (!next) throw new Error('invalid version');
    const body = parseChangelog(text).sections.find(
      (s) => s.name === (beforeBump ? 'Unreleased' : version),
    );
    if (!body) throw new Error('changelog section missing');
    const required = requiredBump(prev, body.body);
    const actual = bumpKind(prev, next);
    if (!actual || !atLeast(actual, required)) {
      throw new Error(`changelog needs a ${required} bump or more, got ${actual ?? 'none'}`);
    }
    return `needs >= ${required}`;
  });
}

function checkGenerated(): void {
  if (fast) return record('generated files fresh (llm:build)', 'SKIP', '--fast');
  check('generated files fresh (llm:build)', () => {
    const run = sh('npm', ['run', 'llm:build']);
    if (!run.ok) throw new Error(tail(run.out));
    const diff = git('status', '--porcelain', '--', 'llm', 'skills');
    if (diff) throw new Error(`npm run llm:build changed files; commit them:\n${diff}`);
  });
}

function checkCi(): void {
  check('CI green on release commit', () => {
    const onMain = git('rev-parse', '--abbrev-ref', 'HEAD') === 'main';
    const sha = git('rev-parse', 'HEAD');
    const fields = 'workflowName,status,conclusion,url';
    const runs = gh(['run', 'list', '--commit', sha, '--json', fields, '--limit', '20']);
    if (!runs.ok && onMain) throw new Error(runs.out);
    const list = runs.ok ? (JSON.parse(runs.stdout) as WorkflowRun[]) : [];
    verdict = ciVerdict(list, onMain);
    if (verdict.state === 'green' || verdict.state === 'deferred') return verdict.detail;
    throw new Error(`${verdict.detail}${verdict.state === 'none' ? ` (${sha.slice(0, 7)})` : ''}`);
  });
}

function checkDatabase(): Promise<void> {
  const url = new URL(
    process.env.PGZ_TEST_URL ?? 'postgres://postgres:postgres@localhost:54329/postgres',
  );
  return new Promise((resolve) => {
    const socket = connect({ host: url.hostname, port: Number(url.port || 5432) });
    const done = (ok: boolean) => {
      socket.destroy();
      if (ok) record('PostgreSQL reachable', 'PASS', `${url.hostname}:${url.port || 5432}`);
      else record('PostgreSQL reachable', 'FAIL', `${url.host} refused; run npm run db:up`);
      resolve();
    };
    socket.setTimeout(3000, () => done(false));
    socket.on('connect', () => done(true));
    socket.on('error', () => done(false));
  });
}

function checkPack(): void {
  check('npm pack content', () => {
    const run = sh('npm', ['pack', '--dry-run', '--json']);
    if (!run.ok) throw new Error(tail(run.out));
    const parsed = JSON.parse(run.stdout) as Record<string, unknown>;
    const first = Array.isArray(parsed)
      ? parsed[0]
      : 'files' in parsed
        ? parsed
        : Object.values(parsed)[0];
    const pack = first as PackInfo | undefined;
    if (!pack) throw new Error('npm pack --json returned no package');
    const paths = pack.files.map((file) => file.path);
    const missing = [
      'package.json',
      'README.md',
      'LICENSE',
      'dist/',
      'llm/USAGE.md',
      'skills/',
    ].filter((want) => !paths.some((path) => path === want || path.startsWith(want)));
    const leaked = paths.filter((path) =>
      /^(src|tests|docs|\.10x|\.github|\.claude|bench)\//.test(path),
    );
    if (missing.length > 0 || leaked.length > 0) {
      throw new Error(
        `missing: ${missing.join(', ') || '-'}; unexpected: ${leaked.slice(0, 5).join(', ') || '-'}`,
      );
    }
    return `${paths.length} files, ${(pack.size / 1024).toFixed(0)} kB`;
  });
}

function checkNpm(previous: string): void {
  check('npm registry state', () => {
    const run = sh('npm', ['view', 'postgrelize', 'version']);
    if (!run.ok && run.out.includes('E404')) return 'not published yet (404)';
    if (!run.ok) throw new Error(tail(run.out));
    const published = run.stdout;
    if (published !== previous.slice(1)) {
      throw new Error(
        `npm has ${published}; latest tag is ${previous}. Reconcile before releasing`,
      );
    }
    return `latest on npm: ${published}`;
  });
}

function benchReminder(tag: string): void {
  const stat = sh('git', [
    'diff',
    '--stat',
    `${tag}..HEAD`,
    '--',
    'src/sql',
    'src/where',
    'src/model',
    'src/connection',
  ]);
  if (stat.stdout) {
    const last = stat.stdout.split('\n').pop() ?? '';
    record(
      'bench gate',
      'NOTE',
      `query code changed since ${tag} (${last.trim()}): run the bench gate from AGENTS.md`,
    );
  } else {
    record('bench gate', 'SKIP', `no query-code changes since ${tag}`);
  }
}

async function main(): Promise<void> {
  if (!parseSemver(target) || (fast && full)) {
    console.error('usage: npm run release:preflight -- X.Y.Z [--before-bump] [--fast | --full]');
    process.exit(2);
  }
  const mode = `${beforeBump ? 'before bump' : 'after bump'}${fast ? ', fast' : ''}${full ? ', full' : ''}`;
  console.log(`Release preflight for ${target} (${mode})\n`);
  let tag = '';
  check('latest tag', () => (tag = latestTag()));
  const previous = tag.slice(1);
  checkGit(target);
  checkVersion(target, previous);
  checkChangelog(target, previous);
  checkGenerated();
  checkCi();
  const plan = planSteps(verdict, full);
  command('lint', 'npm', ['run', 'lint'], false, plan.quality);
  command('format:check', 'npm', ['run', 'format:check'], false, plan.quality);
  command('typecheck', 'npm', ['run', 'typecheck'], false, plan.quality);
  command('docs (TypeDoc + VitePress)', 'npm', ['run', 'docs'], false, plan.quality);
  if (fast) record('PostgreSQL reachable', 'SKIP', '--fast');
  else if (plan.suites && plan.coverage) record('PostgreSQL reachable', 'SKIP', plan.suites);
  else await checkDatabase();
  const legacy = ['vitest', 'run', '--project', 'decorators-legacy'];
  command('tests: decorators-legacy', 'npx', legacy, true, plan.suites);
  command('build', 'npm', ['run', 'build']);
  command('test:build', 'npm', ['run', 'test:build'], true, plan.quality);
  const coverageName = 'tests + coverage: unit, integration, compat, docs examples, thresholds';
  command(coverageName, 'npm', ['run', 'test:coverage'], true, plan.coverage);
  checkPack();
  if (tag) benchReminder(tag);
  checkNpm(tag);
  console.log(`\n${formatTable(rows)}`);
  console.log(`\n${summaryLines(rows, verdict, fast).join('\n')}`);
  const failed = rows.filter((row) => row.status === 'FAIL').length;
  process.exit(failed > 0 ? 1 : 0);
}

await main();
