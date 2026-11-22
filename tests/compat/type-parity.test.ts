import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TypeSurface } from '../support/type-surface.ts';

type Entry = Readonly<{ name: string; category: string; note: string }>;
type Exceptions = Readonly<{
  optionPairs: Readonly<Record<string, string>>;
  typeNames: readonly Entry[];
  optionKeys: Readonly<Record<string, readonly Entry[]>>;
}>;

const CATEGORIES = new Set(['not-planned', 'other-dialect', 'internal', 'tracked']);
// Lower these when entries are removed from the allow-list; they must never grow.
const MAX_TYPE_NAMES = 147;
const MAX_OPTION_KEYS = 71;

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));
const exceptions = JSON.parse(
  readFileSync(here('type-parity/exceptions.json'), 'utf8'),
) as Exceptions;
const tsc = here('../../node_modules/typescript/bin/tsc');

const compile = (library: 'v6' | 'postgrelize'): string => {
  try {
    execFileSync(process.execPath, [tsc, '-p', here(`type-parity/tsconfig.${library}.json`)], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return '';
  } catch (error) {
    return String((error as { stdout?: string }).stdout ?? error);
  }
};

describe('type-level parity with Sequelize v6', () => {
  // The corpus holds the TypeScript a v6 application writes (models without index signatures,
  // `include` / `lock` / `paranoid` finders, `ModelStatic` parameters, `query<T>`, associations and
  // their mixins). It must compile against the v6 declarations and against postgrelize.
  for (const library of ['v6', 'postgrelize'] as const) {
    it(`the corpus compiles against ${library}`, () => {
      expect(compile(library)).toBe('');
    }, 180_000);
  }

  const v6 = new TypeSurface('v6');
  const ours = new TypeSurface('postgrelize');

  it('lacks no exported v6 type name that is not on the allow-list', () => {
    const allowed = new Set(exceptions.typeNames.map((entry) => entry.name));
    const missing = [...v6.names()].filter((name) => !ours.names().has(name)).toSorted();
    expect(missing.filter((name) => !allowed.has(name))).toEqual([]);
    expect([...allowed].filter((name) => !missing.includes(name))).toEqual([]);
    expect(allowed.size).toBeLessThanOrEqual(MAX_TYPE_NAMES);
  });

  describe('option types accept every v6 key that is not on the allow-list', () => {
    for (const [name, ourName] of Object.entries(exceptions.optionPairs)) {
      it(`${name}`, () => {
        const allowed = new Set((exceptions.optionKeys[name] ?? []).map((entry) => entry.name));
        const theirs = v6.keys(name) ?? [];
        const have = new Set(ours.keys(ourName) ?? []);
        const missing = theirs.filter((key) => !have.has(key)).toSorted();
        expect(theirs).not.toEqual([]);
        expect(missing.filter((key) => !allowed.has(key))).toEqual([]);
        expect([...allowed].filter((key) => !missing.includes(key))).toEqual([]);
      });
    }
  });

  it('keeps the allow-lists small and well formed', () => {
    const keyEntries = Object.values(exceptions.optionKeys).flat();
    expect(keyEntries.length).toBeLessThanOrEqual(MAX_OPTION_KEYS);
    for (const entry of [...exceptions.typeNames, ...keyEntries]) {
      expect([entry.name, CATEGORIES.has(entry.category)]).toEqual([entry.name, true]);
      expect([entry.name, entry.note.length > 5]).toEqual([entry.name, true]);
    }
    expect(Object.keys(exceptions.optionKeys).every((name) => name in exceptions.optionPairs)).toBe(
      true,
    );
  });
});
