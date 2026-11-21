import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { fileURLToPath } from 'node:url';
import {
  atLeast,
  bumpKind,
  changelogProblems,
  compareSemver,
  formatTable,
  parseChangelog,
  parseSemver,
  requiredBump,
} from './release-lib.ts';

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
const target = args.find((arg) => !arg.startsWith('--')) ?? '';
const rows: Row[] = [];

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

function command(name: string, cmd: string, argv: string[], slow = false): void {
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
    if (git('rev-parse', '--abbrev-ref', 'HEAD') !== 'main')
      return 'release branch: checked on the PR';
    const sha = git('rev-parse', 'HEAD');
    const runs = gh([
      'run',
      'list',
      '--commit',
      sha,
      '--json',
      'name,status,conclusion',
      '--limit',
      '20',
    ]);
    if (!runs.ok) throw new Error(runs.out);
    const list = JSON.parse(runs.stdout) as { name: string; status: string; conclusion: string }[];
    if (list.length === 0) throw new Error(`no workflow runs for ${sha.slice(0, 7)}`);
    const bad = list.filter((run) => run.status !== 'completed' || run.conclusion !== 'success');
    if (bad.length > 0) {
      throw new Error(bad.map((r) => `${r.name}: ${r.status}/${r.conclusion}`).join('\n'));
    }
    return `${list.map((run) => run.name).join(', ')} succeeded`;
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
  if (!parseSemver(target)) {
    console.error('usage: npm run release:preflight -- X.Y.Z [--before-bump] [--fast]');
    process.exit(2);
  }
  const mode = `${beforeBump ? 'before bump' : 'after bump'}${fast ? ', fast' : ''}`;
  console.log(`Release preflight for ${target} (${mode})\n`);
  let tag = '';
  check('latest tag', () => (tag = latestTag()));
  const previous = tag.slice(1);
  checkGit(target);
  checkVersion(target, previous);
  checkChangelog(target, previous);
  checkGenerated();
  checkCi();
  command('lint', 'npm', ['run', 'lint']);
  command('format:check', 'npm', ['run', 'format:check']);
  command('typecheck', 'npm', ['run', 'typecheck']);
  command('docs (TypeDoc + VitePress)', 'npm', ['run', 'docs']);
  if (!fast) await checkDatabase();
  else record('PostgreSQL reachable', 'SKIP', '--fast');
  command('npm test (all projects incl. docs examples)', 'npm', ['test'], true);
  command('build', 'npm', ['run', 'build']);
  command('test:build', 'npm', ['run', 'test:build'], true);
  command('test:coverage (thresholds)', 'npm', ['run', 'test:coverage'], true);
  checkPack();
  if (tag) benchReminder(tag);
  checkNpm(tag);
  console.log(`\n${formatTable(rows)}`);
  const failed = rows.filter((row) => row.status === 'FAIL').length;
  console.log(failed > 0 ? `\nFAIL: ${failed} check(s) failed` : '\nPASS: all checks passed');
  if (fast) console.log('--fast skipped the long checks; run without it before tagging.');
  process.exit(failed > 0 ? 1 : 0);
}

await main();
