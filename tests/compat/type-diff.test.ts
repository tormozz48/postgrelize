import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TypeDiff } from '../support/type-diff.ts';

type Cause = Readonly<{ category: string; note: string }>;
type Exceptions = Readonly<{
  skipTypes: readonly string[];
  causes: Readonly<Record<string, Cause>>;
  differences: Readonly<Record<string, Readonly<Record<string, string>>>>;
}>;

const CATEGORIES = new Set(['not-planned', 'other-dialect', 'internal', 'tracked']);
const KINDS = ['member', 'generic', 'arity', 'kind'] as const;
// Lower this when entries leave the allow-list; it must never grow.
const MAX_DIFFERENCES = 375;

const exceptions = JSON.parse(
  readFileSync(fileURLToPath(new URL('type-diff/exceptions.json', import.meta.url)), 'utf8'),
) as Exceptions;

describe('declaration diff against Sequelize v6', () => {
  // Every class and interface that v6 and postgrelize both export: members, arity, generics and
  // kind. Names that only v6 exports are tracked by type-parity.test.ts; parameter and member
  // types are covered by the compiled corpora (type-parity, v6-types).
  const found = new TypeDiff('v6', 'postgrelize').differences(new Set(exceptions.skipTypes));

  for (const kind of KINDS) {
    it(`reports no ${kind} difference that is not on the allow-list`, () => {
      const actual = found.filter((d) => d.kind === kind).map((d) => d.key);
      const allowed = Object.keys(exceptions.differences[kind] ?? {});
      expect(actual.filter((key) => !allowed.includes(key))).toEqual([]);
      expect(allowed.filter((key) => !actual.includes(key))).toEqual([]);
    }, 120_000);
  }

  it('keeps every allow-list entry on a known cause and category', () => {
    const entries = Object.values(exceptions.differences).flatMap((map) => Object.values(map));
    const used = new Set(entries);
    expect([...used].filter((id) => !exceptions.causes[id])).toEqual([]);
    expect(Object.keys(exceptions.causes).filter((id) => !used.has(id))).toEqual([]);
    const causes = Object.values(exceptions.causes);
    expect(causes.filter((cause) => !CATEGORIES.has(cause.category))).toEqual([]);
    expect(causes.filter((cause) => cause.note.length === 0)).toEqual([]);
    expect(entries.length).toBeLessThanOrEqual(MAX_DIFFERENCES);
  });
});
