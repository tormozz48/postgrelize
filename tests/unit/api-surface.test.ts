import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as v6 from 'sequelize';
import * as postgrelize from '../../src/index.ts';
import { renderApiDifferences } from '../../scripts/api-differences-lib.ts';

type Entry = Readonly<{ name: string; category: string; note: string }>;
type Exceptions = Readonly<Record<string, readonly Entry[] | string>>;

const CATEGORIES = new Set(['not-planned', 'other-dialect', 'internal', 'tracked-in-issue']);
// Lower this when entries are removed from the allow-list; it must never grow.
const MAX_EXCEPTIONS = 342;

const exceptions = JSON.parse(
  readFileSync(new URL('../compat/api-surface-exceptions.json', import.meta.url), 'utf8'),
) as Exceptions;

const BUILT_IN = new Set(['length', 'name', 'prototype', 'constructor', 'caller', 'arguments']);

const namesOf = (target: unknown): ReadonlySet<string> => {
  const names = new Set<string>();
  let current = target as object | null;
  while (current !== null && current !== Function.prototype && current !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(current)) {
      if (!BUILT_IN.has(name) && !name.startsWith('_')) {
        names.add(name);
      }
    }
    current = Object.getPrototypeOf(current) as object | null;
  }
  return names;
};

const URI = 'postgres://user:password@localhost:5432/surface';
const sequelizeInstance = (lib: { Sequelize: new (uri: string, options: object) => unknown }) =>
  new lib.Sequelize(URI, { logging: false });
const queryInterface = (lib: typeof v6 | typeof postgrelize): unknown =>
  (sequelizeInstance(lib as never) as { getQueryInterface: () => unknown }).getQueryInterface();

type Anyish = Record<string, unknown>;
const surfaces = (): Readonly<Record<string, readonly [unknown, unknown]>> => {
  const reference = v6 as unknown as Anyish;
  const ours = postgrelize as unknown as Anyish;
  return {
    Sequelize: [reference['Sequelize'], ours['Sequelize']],
    'Sequelize.prototype': [
      sequelizeInstance(v6 as never),
      sequelizeInstance(postgrelize as never),
    ],
    Model: [reference['Model'], ours['Model']],
    'Model.prototype': [
      (reference['Model'] as Anyish)['prototype'],
      (ours['Model'] as Anyish)['prototype'],
    ],
    Transaction: [reference['Transaction'], ours['Transaction']],
    'Transaction.prototype': [
      (reference['Transaction'] as Anyish)['prototype'],
      (ours['Transaction'] as Anyish)['prototype'],
    ],
    'QueryInterface.prototype': [queryInterface(v6), queryInterface(postgrelize)],
    DataTypes: [reference['DataTypes'], ours['DataTypes']],
    exports: [reference, ours],
  };
};

const listed = (surface: string): readonly Entry[] => {
  const entries = exceptions[surface];
  return Array.isArray(entries) ? (entries as readonly Entry[]) : [];
};

describe('public API surface vs Sequelize v6', () => {
  for (const [surface, [reference, ours]] of Object.entries(surfaces())) {
    describe(`${surface}`, () => {
      const theirs = namesOf(reference);
      const have = namesOf(ours);
      const missing = [...theirs].filter((name) => !have.has(name)).toSorted();
      const allowed = new Set(listed(surface).map((entry) => entry.name));

      it('lacks no v6 name that is not on the allow-list', () => {
        expect(missing.filter((name) => !allowed.has(name))).toEqual([]);
      });

      it('lists only names that are still missing (the list only shrinks)', () => {
        expect([...allowed].filter((name) => !missing.includes(name))).toEqual([]);
      });
    });
  }

  it('documents every exception with a category and a note', () => {
    const entries = Object.keys(exceptions).flatMap((surface) => listed(surface));
    expect(
      entries.filter((entry) => !CATEGORIES.has(entry.category) || entry.note.length < 10),
    ).toEqual([]);
    expect(entries.length).toBeLessThanOrEqual(MAX_EXCEPTIONS);
  });
});

// oxfmt pads table columns, so the guide is compared without padding.
const flat = (text: string): string => text.replace(/-{3,}/g, '---').replace(/\s+/g, ' ');

describe('migrating guide', () => {
  it('lists the allow-list (run `npm run api:differences`)', () => {
    const page = readFileSync(new URL('../../docs/guide/migrating.md', import.meta.url), 'utf8');
    expect(flat(page)).toContain(flat(renderApiDifferences(exceptions as never)));
  });
});
