import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const changelog = readFileSync(`${root}CHANGELOG.md`, 'utf8');
const version = (JSON.parse(readFileSync(`${root}package.json`, 'utf8')) as { version: string })
  .version;
const repo = 'https://github.com/tormozz48/postgrelize';
const headings = [...changelog.matchAll(/^## \[([^\]]+)\](?: - (\d{4}-\d{2}-\d{2}))?$/gm)];
const names = headings.map((match) => match[1] as string);
const links = new Map(
  [...changelog.matchAll(/^\[([^\]]+)\]: (\S+)$/gm)].map((m) => [m[1] as string, m[2] as string]),
);

describe('CHANGELOG.md', () => {
  it('starts with Unreleased and lists versions newest first', () => {
    expect(names[0]).toBe('Unreleased');
    const versions = names.slice(1).map((name) => name.split('.').map(Number));
    for (let i = 1; i < versions.length; i += 1) {
      const [a, b] = [versions[i - 1] as number[], versions[i] as number[]];
      expect(a[0]! * 1e8 + a[1]! * 1e4 + a[2]!).toBeGreaterThan(b[0]! * 1e8 + b[1]! * 1e4 + b[2]!);
    }
  });

  it('has a dated section for the version in package.json', () => {
    const entry = headings.find((match) => match[1] === version);
    expect(entry, `CHANGELOG.md has no section for ${version}`).toBeDefined();
    expect(entry?.[2]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('links every section to a tag or compare URL', () => {
    const expected = names.map((name, index) => {
      if (name === 'Unreleased') return `${repo}/compare/v${names[1]}...HEAD`;
      if (index === names.length - 1) return `${repo}/releases/tag/v${name}`;
      return `${repo}/compare/v${names[index + 1]}...v${name}`;
    });
    expect(names.map((name) => links.get(name))).toEqual(expected);
  });
});
