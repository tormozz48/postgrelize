import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OPTION_GROUPS } from '../../scripts/option-groups.ts';

// VitePress fails the build on a dead page link but not on a dead `#anchor`. This checks the anchors of
// links between hand-written pages, and of links into the generated option reference.
const docs = new URL('../../docs/', import.meta.url);

const slugify = (heading: string): string =>
  heading
    .replace(/\{#[^}]+\}\s*$/, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[\s~`!@#$%^&*()\-_+=[\]{}|;:"'“”‘’<>,.?/…]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

const anchorsOf = (file: URL): Set<string> => {
  const found = new Set<string>();
  let inFence = false;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (line.startsWith('```')) {
      inFence = !inFence;
    }
    const match = inFence ? null : /^#{1,6}\s+(.*)$/.exec(line);
    if (match !== null) {
      found.add(/\{#([^}]+)\}\s*$/.exec(match[1]!)?.[1] ?? slugify(match[1]!));
    }
  }
  return found;
};

const pages: readonly string[] = [
  ...readdirSync(new URL('guide/', docs)).map((name) => `guide/${name}`),
  'reference/index.md',
  'postgresql-coverage.md',
  'security.md',
  'sequelize-issues.md',
  'index.md',
];

/** The hand-written file behind a site path, when the path is not generated. */
const fileFor = (path: string): URL | undefined => {
  const clean = path.replace(/^\/|\/$/g, '');
  return [`${clean}.md`, `${clean}/index.md`]
    .map((name) => new URL(name, docs))
    .find((url) => existsSync(url));
};

const resolveTarget = (from: string, target: string): string =>
  target.startsWith('/')
    ? target
    : `/${from.replace(/[^/]*$/, '')}${target.replace(/^\.\//, '')}`.replace(/\/{2,}/g, '/');

const problems = (page: string): string[] => {
  const text = readFileSync(new URL(page, docs), 'utf8');
  const found: string[] = [];
  for (const [, link] of text.matchAll(/\]\(([^)\s]+#[^)\s]+)\)/g)) {
    const [target = '', anchor = ''] = link!.split('#');
    if (/^https?:/.test(target) || target.startsWith('/api/')) {
      continue;
    }
    const path = target === '' ? `/${page.replace(/\.md$/, '')}` : resolveTarget(page, target);
    const option = /^\/reference\/options\/([a-z]+)$/.exec(path);
    if (option !== null) {
      const group = OPTION_GROUPS.find((candidate) => candidate.slug === option[1]);
      if (group === undefined || !group.types.some((type) => type.toLowerCase() === anchor)) {
        found.push(`${page}: ${link}`);
      }
      continue;
    }
    const file = fileFor(path);
    if (file !== undefined && !anchorsOf(file).has(anchor)) {
      found.push(`${page}: ${link}`);
    }
  }
  return found;
};

describe('documentation links', () => {
  it.for(pages)('%s has no dead anchors', (page) => {
    expect(problems(page)).toEqual([]);
  });
});
