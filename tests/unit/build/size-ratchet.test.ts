import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// ADR-021: files that still exceed the size limits. Lower these numbers as files are split;
// never raise them.
const MAX_FILES_OVER_150_LINES = 30;
const MAX_FILES_WITH_FUNCTIONS_OVER_20_LINES = 51;

type Override = Readonly<{ files: readonly string[]; rules: Readonly<Record<string, unknown>> }>;

const overrides = (
  JSON.parse(readFileSync(new URL('../../../.oxlintrc.json', import.meta.url), 'utf8')) as {
    overrides: readonly Override[];
  }
).overrides;

const exempted = (rule: string): readonly string[] =>
  overrides.filter((entry) => entry.rules[rule] === 'off').flatMap((entry) => entry.files);

describe('size limit ratchet', () => {
  it('never adds files to the exemption lists', () => {
    expect(exempted('max-lines').length).toBeLessThanOrEqual(MAX_FILES_OVER_150_LINES);
    expect(exempted('max-lines-per-function').length).toBeLessThanOrEqual(
      MAX_FILES_WITH_FUNCTIONS_OVER_20_LINES,
    );
  });

  it('exempts only files under src/', () => {
    expect(
      [...exempted('max-lines'), ...exempted('max-lines-per-function')].every((file) =>
        file.startsWith('src/'),
      ),
    ).toBe(true);
  });
});
