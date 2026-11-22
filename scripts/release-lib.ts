export interface Semver {
  major: number;
  minor: number;
  patch: number;
}

export type BumpKind = 'major' | 'minor' | 'patch';

export interface ChangelogSection {
  name: string;
  date: string | undefined;
  body: string;
}

export const REPO_URL = 'https://github.com/tormozz48/postgrelize';

export function parseSemver(text: string): Semver | null {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(text);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

export function compareSemver(a: Semver, b: Semver): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

export function bumpKind(from: Semver, to: Semver): BumpKind | null {
  if (compareSemver(to, from) <= 0) return null;
  if (to.major > from.major) return 'major';
  return to.minor > from.minor ? 'minor' : 'patch';
}

const RANK: Record<BumpKind, number> = { patch: 0, minor: 1, major: 2 };

export function atLeast(actual: BumpKind, required: BumpKind): boolean {
  return RANK[actual] >= RANK[required];
}

export function parseChangelog(text: string): {
  sections: ChangelogSection[];
  links: Map<string, string>;
} {
  const headings = [...text.matchAll(/^## \[([^\]]+)\](?: - (\d{4}-\d{2}-\d{2}))?[ \t]*$/gm)];
  const sections = headings.map((match, index) => {
    const start = match.index + match[0].length;
    const end = headings[index + 1]?.index ?? text.length;
    return { name: match[1] as string, date: match[2], body: text.slice(start, end) };
  });
  const links = new Map(
    [...text.matchAll(/^\[([^\]]+)\]: (\S+)[ \t]*$/gm)].map((m) => [
      m[1] as string,
      m[2] as string,
    ]),
  );
  return { sections, links };
}

export function bulletsUnder(body: string, heading: string): number {
  const match = new RegExp(
    `^### ${heading}[ \\t]*$([\\s\\S]*?)(?=^### |^## |(?![\\s\\S]))`,
    'm',
  ).exec(body);
  return (match?.[1] ?? '').split('\n').filter((line) => /^- \S/.test(line)).length;
}

export function entryCount(body: string): number {
  return body.split('\n').filter((line) => /^- \S/.test(line)).length;
}

export function requiredBump(previous: Semver, body: string): BumpKind {
  if (bulletsUnder(body, 'Breaking') > 0) return previous.major >= 1 ? 'major' : 'minor';
  const feature = bulletsUnder(body, 'Added') + bulletsUnder(body, 'Removed') > 0;
  return previous.major >= 1 && feature ? 'minor' : 'patch';
}

export function changelogProblems(
  text: string,
  version: string,
  previous: string,
  beforeBump: boolean,
): string[] {
  const { sections, links } = parseChangelog(text);
  const problems: string[] = [];
  if (sections[0]?.name !== 'Unreleased')
    return ['CHANGELOG.md does not start with ## [Unreleased]'];
  if (beforeBump) {
    if (entryCount(sections[0].body) === 0) problems.push('[Unreleased] has no entries');
    return problems;
  }
  if (entryCount(sections[0].body) > 0) problems.push('[Unreleased] still has entries');
  const release = sections.find((section) => section.name === version);
  if (!release) return [...problems, `CHANGELOG.md has no ## [${version}] section`];
  if (!release.date) problems.push(`## [${version}] has no date`);
  if (entryCount(release.body) === 0) problems.push(`## [${version}] has no entries`);
  const expected = new Map([
    ['Unreleased', `${REPO_URL}/compare/v${version}...HEAD`],
    [version, `${REPO_URL}/compare/v${previous}...v${version}`],
  ]);
  for (const [name, url] of expected) {
    if (links.get(name) !== url) problems.push(`link [${name}] should be ${url}`);
  }
  return problems;
}

export function formatTable(rows: { name: string; status: string; detail: string }[]): string {
  const width = Math.max(...rows.map((row) => row.name.length));
  return rows
    .map((row) =>
      `${row.status.padEnd(5)} ${row.name.padEnd(width)}  ${row.detail.split('\n')[0]}`.trimEnd(),
    )
    .join('\n');
}

export interface WorkflowRun {
  workflowName: string;
  status: string;
  conclusion: string;
  url: string;
}

export type CiState = 'green' | 'red' | 'pending' | 'none' | 'deferred';

export interface CiVerdict {
  state: CiState;
  detail: string;
  /** URL of the green `CI` run: it ran lint, format, typecheck, all test projects, build, docs. */
  ciUrl?: string;
  /** URL of the green `Docs` run: it ran `test:coverage` (main only). */
  docsUrl?: string;
}

export interface Plan {
  quality: string | undefined;
  suites: string | undefined;
  coverage: string | undefined;
}

export const COVERED = 'covered by CI run ';
export const DEFERRED = 'not run locally, ';

function deferredVerdict(why: string): CiVerdict {
  return {
    state: 'deferred',
    detail: `release branch: ${why}; checked on the PR and again on main`,
  };
}

export function ciVerdict(runs: WorkflowRun[], onMain: boolean): CiVerdict {
  if (runs.length === 0) {
    return onMain
      ? { state: 'none', detail: 'no workflow runs for this commit' }
      : deferredVerdict('no CI run for this commit yet');
  }
  const unfinished = runs.filter((run) => run.status !== 'completed');
  const failed = runs.filter((run) => run.status === 'completed' && run.conclusion !== 'success');
  const describe = (list: WorkflowRun[]) =>
    list.map((run) => `${run.workflowName}: ${run.status}/${run.conclusion}`).join('\n');
  if (failed.length > 0) return { state: 'red', detail: describe(failed) };
  if (unfinished.length > 0) {
    return onMain
      ? { state: 'pending', detail: describe(unfinished) }
      : deferredVerdict('CI still running');
  }
  return {
    state: 'green',
    detail: `${runs.map((run) => run.workflowName).join(', ')} succeeded`,
    ciUrl: runs.find((run) => run.workflowName === 'CI')?.url,
    docsUrl: runs.find((run) => run.workflowName === 'Docs')?.url,
  };
}

function coveredBy(url: string | undefined): string | undefined {
  return url ? `${COVERED}${url}` : undefined;
}

export function planSteps(verdict: CiVerdict, full: boolean): Plan {
  if (full) return { quality: undefined, suites: undefined, coverage: undefined };
  if (verdict.state === 'deferred') {
    return {
      quality: `${DEFERRED}CI runs it on the release PR`,
      suites: `${DEFERRED}CI runs it on the release PR`,
      coverage: `${DEFERRED}the Docs run on main checks it after the merge`,
    };
  }
  return {
    quality: coveredBy(verdict.ciUrl),
    suites: coveredBy(verdict.ciUrl),
    coverage: coveredBy(verdict.docsUrl),
  };
}

export function summaryLines(
  rows: { status: string }[],
  verdict: CiVerdict,
  fast: boolean,
): string[] {
  const failed = rows.filter((row) => row.status === 'FAIL').length;
  const lines = [failed > 0 ? `FAIL: ${failed} check(s) failed` : 'PASS: all checks passed'];
  if (failed === 0 && verdict.state === 'deferred') {
    lines.push(
      'CI was not checked on this commit; the preflight on main must pass before tagging.',
    );
  }
  if (fast) lines.push('--fast skipped the long checks; run without it before tagging.');
  return lines;
}
