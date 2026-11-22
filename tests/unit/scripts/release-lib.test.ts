import { describe, expect, it } from 'vitest';
import {
  atLeast,
  bumpKind,
  COVERED,
  DEFERRED,
  changelogProblems,
  ciVerdict,
  compareSemver,
  entryCount,
  formatTable,
  parseChangelog,
  parseSemver,
  planSteps,
  requiredBump,
  summaryLines,
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

const run = (workflowName: string, status = 'completed', conclusion = 'success') => ({
  workflowName,
  status,
  conclusion,
  url: `https://github.com/x/actions/runs/${workflowName}`,
});

describe('CI verdict and step plan', () => {
  const green = [run('CI'), run('Docs'), run('CodeQL')];

  it('is green with run URLs when every run succeeded', () => {
    const verdict = ciVerdict(green, true);
    expect(verdict.state).toBe('green');
    expect(verdict.ciUrl).toBe('https://github.com/x/actions/runs/CI');
    expect(verdict.docsUrl).toBe('https://github.com/x/actions/runs/Docs');
  });

  it('is none on main without runs, deferred on a branch', () => {
    expect(ciVerdict([], true).state).toBe('none');
    expect(ciVerdict([], false).state).toBe('deferred');
  });

  it('is red when any run failed, even on a branch', () => {
    expect(ciVerdict([run('CI'), run('Docs', 'completed', 'failure')], true).state).toBe('red');
    expect(ciVerdict([run('CI', 'completed', 'cancelled')], false).state).toBe('red');
  });

  it('is pending on main and deferred on a branch while a run is unfinished', () => {
    const running = [run('CI', 'in_progress', '')];
    expect(ciVerdict(running, true).state).toBe('pending');
    expect(ciVerdict(running, false).state).toBe('deferred');
  });

  it('red wins over unfinished', () => {
    const mixed = [run('CI', 'in_progress', ''), run('Docs', 'completed', 'failure')];
    expect(ciVerdict(mixed, true).state).toBe('red');
  });

  it('skips CI-covered steps with the run URL on a green commit', () => {
    const plan = planSteps(ciVerdict(green, true), false);
    expect(plan.quality).toBe(`${COVERED}https://github.com/x/actions/runs/CI`);
    expect(plan.suites).toBe(plan.quality);
    expect(plan.coverage).toBe(`${COVERED}https://github.com/x/actions/runs/Docs`);
  });

  it('runs coverage locally when no Docs run is green', () => {
    const plan = planSteps(ciVerdict([run('CI')], true), false);
    expect(plan.suites).toContain(COVERED);
    expect(plan.coverage).toBeUndefined();
  });

  it('runs everything locally without a green CI run', () => {
    for (const runs of [[], [run('CI', 'completed', 'failure')], [run('CI', 'queued', '')]]) {
      expect(planSteps(ciVerdict(runs, true), false)).toEqual({
        quality: undefined,
        suites: undefined,
        coverage: undefined,
      });
    }
  });

  it('defers long steps on a release branch without CI', () => {
    const plan = planSteps(ciVerdict([], false), false);
    expect(plan.quality).toContain(DEFERRED);
    expect(plan.suites).toContain(DEFERRED);
    expect(plan.coverage).toContain(DEFERRED);
  });

  it('does not treat a lone Docs run as CI coverage of the suites', () => {
    const plan = planSteps(ciVerdict([run('Docs')], true), false);
    expect(plan.suites).toBeUndefined();
    expect(plan.quality).toBeUndefined();
  });

  it('--full runs everything even on a green commit', () => {
    expect(planSteps(ciVerdict(green, true), true)).toEqual({
      quality: undefined,
      suites: undefined,
      coverage: undefined,
    });
    expect(planSteps(ciVerdict([], false), true).suites).toBeUndefined();
  });
});

describe('summaryLines', () => {
  const pass = [{ status: 'PASS' }, { status: 'SKIP' }];
  const ok = ciVerdict(
    [{ workflowName: 'CI', status: 'completed', conclusion: 'success', url: 'u' }],
    true,
  );
  const deferred = ciVerdict([], false);

  it('says PASS only without failures', () => {
    expect(summaryLines(pass, ok, false)).toEqual(['PASS: all checks passed']);
    expect(summaryLines([...pass, { status: 'FAIL' }], ok, false)).toEqual([
      'FAIL: 1 check(s) failed',
    ]);
  });

  it('warns that CI was not checked on a release branch', () => {
    expect(summaryLines(pass, deferred, false)[1]).toContain('preflight on main');
    expect(summaryLines([{ status: 'FAIL' }], deferred, false)).toHaveLength(1);
  });

  it('reminds that --fast is not the real gate', () => {
    expect(summaryLines(pass, ok, true)[1]).toContain('--fast');
  });
});
