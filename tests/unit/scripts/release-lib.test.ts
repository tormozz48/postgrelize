import { describe, expect, it } from 'vitest';
import {
  atLeast,
  bumpKind,
  changelogProblems,
  compareSemver,
  entryCount,
  formatTable,
  parseChangelog,
  parseSemver,
  requiredBump,
} from '../../../scripts/release-lib.ts';

const repo = 'https://github.com/tormozz48/postgrelize';
const v = (text: string) => parseSemver(text)!;

const before = `# Changelog

## [Unreleased]

### Added

- A feature. [#1](x)

## [0.12.0] - 2026-11-16

### Fixed

- A fix.

[Unreleased]: ${repo}/compare/v0.12.0...HEAD
[0.12.0]: ${repo}/releases/tag/v0.12.0
`;

const after = `# Changelog

## [Unreleased]

## [0.13.0] - 2026-11-22

### Added

- A feature. [#1](x)

## [0.12.0] - 2026-11-16

### Fixed

- A fix.

[Unreleased]: ${repo}/compare/v0.13.0...HEAD
[0.13.0]: ${repo}/compare/v0.12.0...v0.13.0
[0.12.0]: ${repo}/releases/tag/v0.12.0
`;

describe('semver helpers', () => {
  it('parses strict X.Y.Z only', () => {
    expect(parseSemver('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
    for (const bad of ['1.2', 'v1.2.3', '01.2.3', '1.2.3-rc.1', '']) {
      expect(parseSemver(bad)).toBeNull();
    }
  });

  it('compares and classifies bumps', () => {
    expect(compareSemver(v('0.10.0'), v('0.9.0'))).toBeGreaterThan(0);
    expect(bumpKind(v('0.12.0'), v('0.12.1'))).toBe('patch');
    expect(bumpKind(v('0.12.0'), v('0.13.0'))).toBe('minor');
    expect(bumpKind(v('0.12.0'), v('1.0.0'))).toBe('major');
    expect(bumpKind(v('0.12.0'), v('0.12.0'))).toBeNull();
    expect(bumpKind(v('1.2.0'), v('1.1.9'))).toBeNull();
    expect(atLeast('major', 'minor')).toBe(true);
    expect(atLeast('patch', 'minor')).toBe(false);
  });
});

describe('requiredBump', () => {
  const breaking = '\n### Breaking\n\n- Renamed.\n\n### Added\n\n- X.\n';
  const added = '\n### Added\n\n- X.\n';
  const fixed = '\n### Fixed\n\n- Y.\n';

  it('follows the 0.x rule: breaking is minor, the rest patch', () => {
    expect(requiredBump(v('0.12.0'), breaking)).toBe('minor');
    expect(requiredBump(v('0.12.0'), added)).toBe('patch');
  });

  it('follows semver from 1.0: breaking major, feature minor, fix patch', () => {
    expect(requiredBump(v('1.0.0'), breaking)).toBe('major');
    expect(requiredBump(v('1.0.0'), added)).toBe('minor');
    expect(requiredBump(v('1.0.0'), fixed)).toBe('patch');
  });

  it('ignores an empty Breaking heading', () => {
    expect(requiredBump(v('1.0.0'), '\n### Breaking\n\n### Fixed\n\n- Y.\n')).toBe('patch');
  });
});

describe('changelog parsing', () => {
  it('splits sections and links', () => {
    const { sections, links } = parseChangelog(before);
    expect(sections.map((s) => [s.name, s.date])).toEqual([
      ['Unreleased', undefined],
      ['0.12.0', '2026-11-16'],
    ]);
    expect(links.get('0.12.0')).toBe(`${repo}/releases/tag/v0.12.0`);
    expect(entryCount(sections[0]!.body)).toBe(1);
  });

  it('accepts a notes-ready Unreleased before the bump', () => {
    expect(changelogProblems(before, '0.13.0', '0.12.0', true)).toEqual([]);
  });

  it('rejects an empty Unreleased before the bump', () => {
    const empty = before.replace('- A feature. [#1](x)\n', '');
    expect(changelogProblems(empty, '0.13.0', '0.12.0', true)).toEqual([
      '[Unreleased] has no entries',
    ]);
  });

  it('accepts a dated release section with compare links after the bump', () => {
    expect(changelogProblems(after, '0.13.0', '0.12.0', false)).toEqual([]);
  });

  it('reports a missing section, a missing date and wrong links', () => {
    expect(changelogProblems(before, '0.13.0', '0.12.0', false)).toContain(
      'CHANGELOG.md has no ## [0.13.0] section',
    );
    const undated = after.replace('## [0.13.0] - 2026-11-22', '## [0.13.0]');
    expect(changelogProblems(undated, '0.13.0', '0.12.0', false)).toContain(
      '## [0.13.0] has no date',
    );
    const badLinks = after.replace('compare/v0.13.0...HEAD', 'compare/v0.12.0...HEAD');
    expect(changelogProblems(badLinks, '0.13.0', '0.12.0', false)).toEqual([
      `link [Unreleased] should be ${repo}/compare/v0.13.0...HEAD`,
    ]);
  });

  it('rejects entries left in Unreleased after the bump', () => {
    const left = after.replace('## [Unreleased]\n', '## [Unreleased]\n\n- Forgotten.\n');
    expect(changelogProblems(left, '0.13.0', '0.12.0', false)).toContain(
      '[Unreleased] still has entries',
    );
  });

  it('requires the file to start with Unreleased', () => {
    expect(changelogProblems('# Changelog\n', '0.13.0', '0.12.0', true)).toHaveLength(1);
  });
});

describe('formatTable', () => {
  it('aligns names', () => {
    expect(
      formatTable([
        { name: 'a', status: 'PASS', detail: 'x' },
        { name: 'bbb', status: 'FAIL', detail: '' },
      ]),
    ).toBe('PASS  a    x\nFAIL  bbb');
  });
});
