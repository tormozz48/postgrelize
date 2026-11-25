import { describe, expect, it } from 'vitest';
import {
  baselineFrom,
  checkCauses,
  compareWithBaseline,
  summarizeCauses,
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
      causes: { unclassified: expect.objectContaining({ cause: 'unclassified' }) },
      files: {
        'x.js': { loadError: true, cause: 'unclassified' },
        'z.js': { failing: ['a', 'b'], causes: { a: 'unclassified', b: 'unclassified' } },
      },
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
    ).toEqual({
      f: {
        unstable: true,
        pass: 7,
        failing: ['"before all" hook: setup', 'a'],
        causes: { '"before all" hook: setup': 'unclassified', a: 'unclassified' },
      },
    });
  });
});

describe('v6 suite causes', () => {
  const info = { cause: 'harness', area: 'internals', note: 'stubs a v6 internal' } as const;
  const classified: Baseline = {
    version: '6',
    causes: {
      stub: info,
      gap: {
        cause: 'bug',
        area: 'hooks',
        note: 'n',
        risk: 'error',
        repro: 'Model.beforeAssociate',
      },
      pg: { cause: 'divergence', area: 'where', note: 'n', ref: 'ADR-016' },
    },
    files: {
      'a.js': { failing: ['x', 'y'], causes: { x: 'stub', y: 'gap' } },
      'b.js': { loadError: true, cause: 'pg' },
    },
  };

  it('accepts a fully classified baseline', () => {
    expect(checkCauses(classified)).toEqual([]);
  });

  it('reports entries without a cause, unclassified and unknown ones', () => {
    const problems = checkCauses({
      version: '6',
      causes: classified.causes as NonNullable<Baseline['causes']>,
      files: {
        'a.js': { failing: ['x', 'y', 'z'], causes: { x: 'stub', y: 'nope', z: 'unclassified' } },
        'b.js': { loadError: true },
        'c.js': { failing: ['q'], causes: { q: 'stub', gone: 'stub' } },
      },
    });
    expect(problems).toEqual([
      'a.js: y: unknown cause "nope"',
      'a.js: z: unclassified',
      'b.js: no cause',
      'c.js: cause for unknown entry gone',
    ]);
  });

  it('requires a risk and a repro for a bug, a ref for a divergence', () => {
    const problems = checkCauses({
      version: '6',
      causes: {
        b: { cause: 'bug', area: 'a', note: 'n' },
        d: { cause: 'divergence', area: 'a', note: 'n' },
        e: { cause: 'harness', area: '', note: 'n' },
      },
      files: {},
    });
    expect(problems).toEqual([
      'cause b: a bug needs a risk',
      'cause b: a bug needs a repro',
      'cause d: a divergence needs a ref (ADR or docs row)',
      'cause e: area and note are required',
    ]);
  });

  it('keeps the causes of entries that still fail and marks new ones unclassified', () => {
    const next = baselineFrom(
      '6',
      {
        'a.js': { ...ok, failing: ['x', 'new'] },
        'b.js': { ...ok, loadError: 'boom' },
        'c.js': { ...ok, loadError: 'boom' },
      },
      undefined,
      classified,
    );
    expect(next.files['a.js']?.causes).toEqual({ x: 'stub', new: 'unclassified' });
    expect(next.files['b.js']?.cause).toBe('pg');
    expect(next.files['c.js']?.cause).toBe('unclassified');
    expect(Object.keys(next.causes ?? {})).toEqual(['pg', 'stub', 'unclassified']);
    expect(checkCauses(next)).toEqual(['a.js: new: unclassified', 'c.js: unclassified']);
  });

  it('counts entries by cause and area', () => {
    expect(summarizeCauses(classified)).toEqual({
      total: 3,
      byCause: { harness: 1, bug: 1, divergence: 1 },
      byArea: { internals: 1, hooks: 1, where: 1 },
      byCauseAndArea: { 'harness/internals': 1, 'bug/hooks': 1, 'divergence/where': 1 },
      rootCauses: { harness: 1, bug: 1, divergence: 1 },
    });
  });
});
