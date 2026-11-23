import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

type Cause = Readonly<{ category: string; note: string }>;
type Entry = Readonly<{
  file: string;
  code: string;
  message: string;
  count: number;
  cause: string;
}>;
type Exceptions = Readonly<{ causes: Readonly<Record<string, Cause>>; errors: readonly Entry[] }>;

const CATEGORIES = new Set(['not-planned', 'other-dialect', 'internal', 'tracked']);
// Lower this when entries leave the allow-list; it must never grow.
const MAX_ERRORS = 173;

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));
const exceptions = JSON.parse(readFileSync(here('v6-types/exceptions.json'), 'utf8')) as Exceptions;
const tsc = here('../../node_modules/typescript/bin/tsc');
const ERROR_LINE = /^tests\/compat\/v6-types\/corpus\/(.+?)\(\d+,\d+\): error (TS\d+): (.*)$/;

// Errors as `file | code | message`, one per occurrence. Lines are left out so that moving code in
// the corpus does not change the key; the message is cut like the allow-list entries.
const compile = (library: 'v6' | 'postgrelize'): string[] => {
  let output: string;
  try {
    output = execFileSync(
      process.execPath,
      [tsc, '-p', here(`v6-types/tsconfig.${library}.json`), '--pretty', 'false'],
      { encoding: 'utf8', stdio: 'pipe', cwd: here('../..') },
    );
  } catch (error) {
    output = String((error as { stdout?: string }).stdout ?? error);
  }
  return output
    .split('\n')
    .flatMap((line) => {
      const match = ERROR_LINE.exec(line);
      return match ? [`${match[1]} | ${match[2]} | ${match[3]?.slice(0, 120)}`] : [];
    })
    .toSorted();
};

const expected = exceptions.errors
  .flatMap((entry) =>
    Array.from({ length: entry.count }, () => `${entry.file} | ${entry.code} | ${entry.message}`),
  )
  .toSorted();

describe("Sequelize v6's own test/types corpus", () => {
  // The corpus is test/types of sequelize@6.37.8 (see v6-types/README.md). It must compile against
  // the v6 declarations, otherwise the baseline broke (a TypeScript or expect-type change) and no
  // difference below can be trusted.
  it('compiles against the v6 declarations', () => {
    expect(compile('v6')).toEqual([]);
  }, 180_000);

  it('fails against postgrelize exactly where the allow-list says', () => {
    expect(compile('postgrelize')).toEqual(expected);
  }, 180_000);

  it('keeps every allow-list entry on a known cause and category', () => {
    const used = new Set(exceptions.errors.map((entry) => entry.cause));
    expect([...used].filter((id) => !exceptions.causes[id])).toEqual([]);
    expect(Object.keys(exceptions.causes).filter((id) => !used.has(id))).toEqual([]);
    const causes = Object.values(exceptions.causes);
    expect(causes.filter((cause) => !CATEGORIES.has(cause.category))).toEqual([]);
    expect(causes.filter((cause) => cause.note.length === 0)).toEqual([]);
    expect(expected.length).toBeLessThanOrEqual(MAX_ERRORS);
  });
});
