import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AREAS,
  POSTGRESQL_FEATURES,
  type FeatureStatus,
} from '../../docs/coverage/postgresql-features.ts';

const root = new URL('../../', import.meta.url);
const STATUSES: readonly FeatureStatus[] = ['supported', 'literal', 'planned', 'out-of-scope'];

describe('PostgreSQL coverage matrix', () => {
  it('has unique features', () => {
    const keys = POSTGRESQL_FEATURES.map((row) => `${row.area} / ${row.feature}`);
    expect(keys.filter((key, index) => keys.indexOf(key) !== index)).toEqual([]);
  });

  it('uses known areas and statuses and covers every area', () => {
    const invalid = POSTGRESQL_FEATURES.filter(
      (row) => !AREAS.includes(row.area) || !STATUSES.includes(row.status),
    );
    expect(invalid.map((row) => row.feature)).toEqual([]);
    const empty = AREAS.filter((area) => !POSTGRESQL_FEATURES.some((row) => row.area === area));
    expect(empty).toEqual([]);
  });

  it('explains every row that is not supported', () => {
    const missing = POSTGRESQL_FEATURES.filter(
      (row) => row.status !== 'supported' && row.note.trim() === '',
    );
    expect(missing.map((row) => row.feature)).toEqual([]);
  });

  it('points every supported row to an existing test that contains the given name', () => {
    const problems = POSTGRESQL_FEATURES.flatMap((row) => {
      if (row.test === undefined) {
        return row.status === 'supported' ? [`${row.feature}: no test reference`] : [];
      }
      const url = new URL(row.test.file, root);
      if (!existsSync(url)) {
        return [`${row.feature}: ${row.test.file} does not exist`];
      }
      return readFileSync(url, 'utf8').includes(row.test.name)
        ? []
        : [`${row.feature}: "${row.test.name}" not found in ${row.test.file}`];
    });
    expect(problems).toEqual([]);
  });
});
