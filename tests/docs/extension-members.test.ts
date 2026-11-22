import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { EXTENSION_MEMBERS } from '../../docs/coverage/extension-members.ts';
import { TsdocModel } from './support/tsdoc-model.ts';

// The curated method list on the "Extensions" page must name real public members and real guide headings.
let paths: Set<string>;
beforeAll(async () => {
  paths = new Set((await TsdocModel.load()).items.map((item) => item.path));
});

const slugify = (heading: string): string =>
  heading
    .replace(/\{#[^}]+\}\s*$/, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[\s~`!@#$%^&*()\-_+=[\]{}|;:"'“”‘’<>,.?/…]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

const anchors = (page: string): Set<string> => {
  const file = new URL(`../../docs/guide/${page}.md`, import.meta.url);
  if (!existsSync(file)) {
    return new Set();
  }
  const found = new Set<string>();
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = /^#{1,6}\s+(.*)$/.exec(line);
    if (match !== null) {
      found.add(/\{#([^}]+)\}\s*$/.exec(match[1]!)?.[1] ?? slugify(match[1]!));
    }
  }
  return found;
};

describe('extension members', () => {
  it('names members that exist in the public API', () => {
    expect(
      EXTENSION_MEMBERS.filter((item) => !paths.has(item.member)).map((i) => i.member),
    ).toEqual([]);
  });

  it('links to guide headings that exist', () => {
    const broken = EXTENSION_MEMBERS.filter((item) => {
      const [page = '', anchor = ''] = item.guide.split('#');
      return !anchors(page).has(anchor);
    });
    expect(broken.map((item) => `${item.member} -> ${item.guide}`)).toEqual([]);
  });
});
