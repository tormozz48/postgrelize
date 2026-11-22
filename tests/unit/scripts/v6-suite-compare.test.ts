import { describe, expect, it } from 'vitest';
import {
  baselineFrom,
  compareWithBaseline,
  type Baseline,
} from '../../../scripts/v6-suite/compare-lib.ts';

const baseline: Baseline = {
  version: '6.37.8',
  files: {
    'test/unit/a.test.js': { failing: ['A x', 'A y'] },
    'test/unit/b.test.js': { loadError: true },
  },
};
const ok = { pass: 1, pending: 0, failing: [] as string[] };

describe('v6 suite comparison with the baseline', () => {
  it('accepts exactly the expected failures', () => {
    const result = compareWithBaseline(baseline, {
      'test/unit/a.test.js': { ...ok, failing: ['A y', 'A x'] },
      'test/unit/b.test.js': { ...ok, loadError: 'boom' },
    });
    expect(result).toMatchObject({
      regressions: [],
      stale: [],
      failed: 2,
      loaded: 1,
      notLoaded: 1,
    });
  });

  it('reports a new failure, a file that stopped loading and a new failing file as regressions', () => {
    const result = compareWithBaseline(baseline, {
      'test/unit/a.test.js': { ...ok, failing: ['A x', 'A y', 'A z'] },
      'test/unit/b.test.js': ok,
      'test/unit/c.test.js': { ...ok, loadError: 'boom' },
    });
    expect(result.regressions).toEqual([
      'test/unit/a.test.js: A z',
      'test/unit/c.test.js: does not load (boom)',
    ]);
    expect(result.stale).toEqual(['test/unit/b.test.js: loads now']);
  });

  it('reports fixed and missing entries as stale', () => {
    const result = compareWithBaseline(baseline, {
      'test/unit/a.test.js': { ...ok, failing: ['A x'] },
    });
    expect(result.stale).toEqual([
      'test/unit/a.test.js: A y',
      'test/unit/b.test.js: file no longer exists',
    ]);
  });

  it('counts duplicate titles', () => {
    const result = compareWithBaseline(
      { version: '6', files: { f: { failing: ['T'] } } },
      { f: { ...ok, failing: ['T', 'T'] } },
    );
    expect(result.regressions).toEqual(['f: T']);
  });

  it('builds a sorted baseline from a run', () => {
    expect(
      baselineFrom('6.37.8', {
        'z.js': { ...ok, failing: ['b', 'a'] },
        'y.js': ok,
        'x.js': { ...ok, loadError: 'e' },
      }),
    ).toEqual({
      version: '6.37.8',
      files: { 'x.js': { loadError: true }, 'z.js': { failing: ['a', 'b'] } },
    });
  });

  it('compares a file with a failing hook only by its passing tests', () => {
    const hook = {
      version: '6',
      files: { f: { unstable: true as const, pass: 100, failing: ['"after each" hook for "x"'] } },
    };
    expect(
      compareWithBaseline(hook, { f: { ...ok, pass: 91, failing: ['other'] } }).regressions,
    ).toEqual([]);
    expect(compareWithBaseline(hook, { f: { ...ok, pass: 89, failing: [] } }).regressions).toEqual([
      'f: 89 tests pass, baseline 100',
    ]);
    expect(
      baselineFrom('6', { f: { pass: 7, pending: 0, failing: ['"before all" hook: setup', 'a'] } })
        .files,
    ).toEqual({ f: { unstable: true, pass: 7, failing: ['"before all" hook: setup', 'a'] } });
  });
});
