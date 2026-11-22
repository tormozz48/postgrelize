/** Outcome of one v6 test file. A file that did not load has `loadError` and no counts. */
export type FileResult = Readonly<{
  pass: number;
  pending: number;
  failing: readonly string[];
  loadError?: string;
}>;

/** Expected failures per file; a file may only fail to load when it did so in the baseline. */
export type BaselineFile = Readonly<{
  failing?: readonly string[];
  loadError?: true;
  /** A failing hook aborts the rest of a suite at a point that varies from run to run. */
  unstable?: true;
  /** Passing tests of an `unstable` file in the baseline run. */
  pass?: number;
}>;

export type Baseline = Readonly<{ version: string; files: Readonly<Record<string, BaselineFile>> }>;

/** An `unstable` file may lose this share of its passing tests before it counts as a regression. */
export const UNSTABLE_TOLERANCE = 0.1;

const isHookFailure = (title: string): boolean => /^"(before|after) (each|all)" hook/.test(title);

export type Comparison = Readonly<{
  /** Failures not in the baseline: tests that passed before, files that stopped loading, new files. */
  regressions: readonly string[];
  /** Baseline entries that no longer fail (fixed, renamed or removed): delete them from the baseline. */
  stale: readonly string[];
  passed: number;
  failed: number;
  loaded: number;
  notLoaded: number;
}>;

const counts = (titles: readonly string[]): Map<string, number> => {
  const map = new Map<string, number>();
  for (const title of titles) map.set(title, (map.get(title) ?? 0) + 1);
  return map;
};

const unmatched = (left: readonly string[], right: readonly string[]): string[] => {
  const available = counts(right);
  const out: string[] = [];
  for (const title of left) {
    const remaining = available.get(title) ?? 0;
    if (remaining > 0) available.set(title, remaining - 1);
    else out.push(title);
  }
  return out;
};

/**
 * Compares the results of a run with the baseline of expected failures. The baseline only shrinks:
 * a failure it does not list is a regression, an entry that no longer fails is stale.
 *
 * @param baseline - Expected failures.
 * @param results - Results by file path.
 * @returns Regressions, stale entries and totals.
 */
export const compareWithBaseline = (
  baseline: Baseline,
  results: Readonly<Record<string, FileResult>>,
): Comparison => {
  const regressions: string[] = [];
  const stale: string[] = [];
  let passed = 0;
  let failed = 0;
  let notLoaded = 0;
  for (const [file, result] of Object.entries(results)) {
    const expected = baseline.files[file];
    passed += result.pass;
    failed += result.failing.length;
    if (result.loadError !== undefined) {
      notLoaded += 1;
      if (expected?.loadError !== true)
        regressions.push(`${file}: does not load (${result.loadError})`);
      continue;
    }
    if (expected?.loadError === true) {
      stale.push(`${file}: loads now`);
    }
    if (expected?.unstable === true) {
      const floor = Math.floor((expected.pass ?? 0) * (1 - UNSTABLE_TOLERANCE));
      if (result.pass < floor)
        regressions.push(`${file}: ${result.pass} tests pass, baseline ${expected.pass}`);
      continue;
    }
    const known = expected?.failing ?? [];
    for (const title of unmatched(result.failing, known)) regressions.push(`${file}: ${title}`);
    for (const title of unmatched(known, result.failing)) stale.push(`${file}: ${title}`);
  }
  for (const file of Object.keys(baseline.files)) {
    if (!(file in results)) stale.push(`${file}: file no longer exists`);
  }
  return {
    regressions,
    stale,
    passed,
    failed,
    loaded: Object.keys(results).length - notLoaded,
    notLoaded,
  };
};

/**
 * Builds a baseline from a run: every current failure becomes expected.
 *
 * @param version - v6 version the run used.
 * @param results - Results by file path.
 * @param repeat - A second run of the same files: a file whose failures differ between the runs, or
 * that has a failing hook, is recorded as `unstable`.
 * @returns The baseline, files in path order.
 */
export const baselineFrom = (
  version: string,
  results: Readonly<Record<string, FileResult>>,
  repeat: Readonly<Record<string, FileResult>> = results,
): Baseline => {
  const files: Record<string, BaselineFile> = {};
  for (const file of Object.keys(results).toSorted()) {
    const result = results[file] as FileResult;
    const other = repeat[file] ?? result;
    const differs = result.failing.toSorted().join('\n') !== other.failing.toSorted().join('\n');
    if (result.loadError !== undefined) files[file] = { loadError: true };
    else if (differs || result.failing.some(isHookFailure) || other.failing.some(isHookFailure)) {
      files[file] = {
        unstable: true,
        pass: Math.min(result.pass, other.pass),
        failing: result.failing.toSorted(),
      };
    } else if (result.failing.length > 0) files[file] = { failing: result.failing.toSorted() };
  }
  return { version, files };
};
