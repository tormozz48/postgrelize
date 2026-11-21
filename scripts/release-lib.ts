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
