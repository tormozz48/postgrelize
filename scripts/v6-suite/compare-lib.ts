/** Outcome of one v6 test file. A file that did not load has `loadError` and no counts. */
export type FileResult = Readonly<{
  pass: number;
  pending: number;
  failing: readonly string[];
  /** First line of the error of each failing test, by title (diagnostics only). */
  messages?: Readonly<Record<string, string>>;
  loadError?: string;
}>;

/**
 * Why a baseline entry fails. `triage` is an assertion difference whose root cause is not found yet
 * (it counts as classified so the baseline can be committed, but is listed in the report);
 * `unclassified` marks a new entry nobody has looked at yet and fails the check.
 */
export const CAUSES = [
  'bug',
  'divergence',
  'harness',
  'unsupported',
  'flaky',
  'triage',
  'unclassified',
] as const;
export type Cause = (typeof CAUSES)[number];

/** How much a `bug` can hurt a user, most severe first. */
export const RISKS = ['data-loss', 'wrong-result', 'error', 'wording', 'cosmetic'] as const;
export type Risk = (typeof RISKS)[number];

/** One root cause shared by many baseline entries. */
export type CauseInfo = Readonly<{
  cause: Cause;
  /** Feature area: paranoid, include, hooks, transaction, where, datatypes, query-interface, ... */
  area: string;
  /** What fails and why, in one or two sentences. */
  note: string;
  /** `bug` only: how much it can hurt a user. */
  risk?: Risk;
  /** `bug` only: a one-line reproduction. */
  repro?: string;
  /** `divergence` and `unsupported`: the ADR, `docs/sequelize-issues.md` row or migrating-guide entry that explains it. */
  ref?: string;
}>;

/** Expected failures per file; a file may only fail to load when it did so in the baseline. */
export type BaselineFile = Readonly<{
  failing?: readonly string[];
  /** Cause id (key of `Baseline.causes`) of each failing title. */
  causes?: Readonly<Record<string, string>>;
  loadError?: true;
  /** Cause id of a file that does not load. */
  cause?: string;
  /** A failing hook aborts the rest of a suite at a point that varies from run to run. */
  unstable?: true;
  /** Passing tests of an `unstable` file in the baseline run. */
  pass?: number;
}>;

export type Baseline = Readonly<{
  version: string;
  /** Root causes by id; every failing entry of `files` points at one. */
  causes?: Readonly<Record<string, CauseInfo>>;
  files: Readonly<Record<string, BaselineFile>>;
}>;

export const UNCLASSIFIED = 'unclassified';
const UNCLASSIFIED_INFO: CauseInfo = {
  cause: 'unclassified',
  area: 'unclassified',
  note: 'New failure: find the cause and replace this id.',
};

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

const withCauses = (
  titles: readonly string[],
  before: BaselineFile | undefined,
): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const title of titles) out[title] = before?.causes?.[title] ?? UNCLASSIFIED;
  return out;
};

/**
 * Builds a baseline from a run: every current failure becomes expected.
 *
 * @param version - v6 version the run used.
 * @param results - Results by file path.
 * @param repeat - A second run of the same files: a file whose failures differ between the runs, or
 * that has a failing hook, is recorded as `unstable`.
 * @param previous - The baseline being replaced: entries that still fail keep their cause, new ones
 * are `unclassified`, causes no entry uses any more are dropped.
 * @returns The baseline, files in path order.
 */
export const baselineFrom = (
  version: string,
  results: Readonly<Record<string, FileResult>>,
  repeat: Readonly<Record<string, FileResult>> = results,
  previous?: Baseline,
): Baseline => {
  const files: Record<string, BaselineFile> = {};
  const add = (file: string, entry: BaselineFile): void => {
    const before = previous?.files[file];
    if (entry.failing !== undefined)
      files[file] = { ...entry, causes: withCauses(entry.failing, before) };
    else files[file] = { ...entry, cause: before?.cause ?? UNCLASSIFIED };
  };
  for (const file of Object.keys(results).toSorted()) {
    const result = results[file] as FileResult;
    const other = repeat[file] ?? result;
    const differs = result.failing.toSorted().join('\n') !== other.failing.toSorted().join('\n');
    if (result.loadError !== undefined) add(file, { loadError: true });
    else if (differs || result.failing.some(isHookFailure) || other.failing.some(isHookFailure)) {
      add(file, {
        unstable: true,
        pass: Math.min(result.pass, other.pass),
        failing: result.failing.toSorted(),
      });
    } else if (result.failing.length > 0) add(file, { failing: result.failing.toSorted() });
  }
  const used = new Set(
    Object.values(files).flatMap((entry) => [
      ...Object.values(entry.causes ?? {}),
      entry.cause ?? '',
    ]),
  );
  const causes: Record<string, CauseInfo> = {};
  for (const id of [...used].toSorted()) {
    const info = id === UNCLASSIFIED ? UNCLASSIFIED_INFO : previous?.causes?.[id];
    if (info !== undefined) causes[id] = info;
  }
  return { version, causes, files };
};

/**
 * Checks that every baseline entry has a known cause, and that a cause carries what its kind needs.
 *
 * @param baseline - The baseline to check.
 * @returns One line per problem; empty when every entry is classified. An `unclassified` entry is a
 * problem: classify it before the baseline is committed.
 */
export const checkCauses = (baseline: Baseline): string[] => {
  const problems: string[] = [];
  const causes = baseline.causes ?? {};
  const known = (id: string | undefined, where: string): void => {
    if (id === undefined) problems.push(`${where}: no cause`);
    else if (id === UNCLASSIFIED) problems.push(`${where}: unclassified`);
    else if (!(id in causes)) problems.push(`${where}: unknown cause "${id}"`);
  };
  for (const [file, entry] of Object.entries(baseline.files)) {
    if (entry.loadError === true) known(entry.cause, file);
    for (const title of entry.failing ?? []) known(entry.causes?.[title], `${file}: ${title}`);
    for (const title of Object.keys(entry.causes ?? {})) {
      if (!(entry.failing ?? []).includes(title))
        problems.push(`${file}: cause for unknown entry ${title}`);
    }
  }
  for (const [id, info] of Object.entries(causes)) {
    if (id === UNCLASSIFIED) continue;
    if (!CAUSES.includes(info.cause) || info.cause === 'unclassified')
      problems.push(`cause ${id}: invalid kind "${info.cause}"`);
    if (info.area === '' || info.note === '')
      problems.push(`cause ${id}: area and note are required`);
    if (info.cause === 'bug' && (info.risk === undefined || !RISKS.includes(info.risk)))
      problems.push(`cause ${id}: a bug needs a risk`);
    if (info.cause === 'bug' && (info.repro ?? '') === '')
      problems.push(`cause ${id}: a bug needs a repro`);
    if (info.cause === 'divergence' && (info.ref ?? '') === '')
      problems.push(`cause ${id}: a divergence needs a ref (ADR or docs row)`);
  }
  return problems;
};

export type CauseSummary = Readonly<{
  total: number;
  byCause: Readonly<Record<string, number>>;
  byArea: Readonly<Record<string, number>>;
  byCauseAndArea: Readonly<Record<string, number>>;
  /** Root causes by kind. */
  rootCauses: Readonly<Record<string, number>>;
}>;

/**
 * Counts baseline entries (failing tests plus files that do not load) by cause and area.
 *
 * @param baseline - A classified baseline.
 * @returns Counts of entries and of distinct root causes.
 */
export const summarizeCauses = (baseline: Baseline): CauseSummary => {
  const byCause: Record<string, number> = {};
  const byArea: Record<string, number> = {};
  const byCauseAndArea: Record<string, number> = {};
  const rootCauses: Record<string, number> = {};
  let total = 0;
  const bump = (id: string | undefined): void => {
    const info = baseline.causes?.[id ?? ''];
    const kind = info?.cause ?? UNCLASSIFIED;
    const area = info?.area ?? UNCLASSIFIED;
    total += 1;
    byCause[kind] = (byCause[kind] ?? 0) + 1;
    byArea[area] = (byArea[area] ?? 0) + 1;
    byCauseAndArea[`${kind}/${area}`] = (byCauseAndArea[`${kind}/${area}`] ?? 0) + 1;
  };
  for (const entry of Object.values(baseline.files)) {
    if (entry.loadError === true) bump(entry.cause);
    for (const title of entry.failing ?? []) bump(entry.causes?.[title]);
  }
  for (const info of Object.values(baseline.causes ?? {}))
    rootCauses[info.cause] = (rootCauses[info.cause] ?? 0) + 1;
  return { total, byCause, byArea, byCauseAndArea, rootCauses };
};
