import { beforeAll, describe, expect, it } from 'vitest';
import allowlist from './tsdoc-example-allowlist.json' with { type: 'json' };
import { ExampleCompiler } from './support/example-compiler.ts';
import { TsdocModel } from './support/tsdoc-model.ts';
import { TsdocRules } from './support/tsdoc-rules.ts';

describe('TSDoc of the public API', () => {
  let model: TsdocModel;
  const rules = new TsdocRules(allowlist);

  beforeAll(async () => {
    model = await TsdocModel.load();
  }, 600_000);

  it('documents every public item to the AGENTS.md standard', () => {
    expect(rules.violations(model.items)).toEqual([]);
  });

  it('keeps the example allowlist minimal', () => {
    expect(rules.staleAllowlist(model.items)).toEqual([]);
  });

  it('type-checks every @example against the current API', () => {
    const failures = new ExampleCompiler(model.exportedNames).check(model.items);
    expect(failures.map((f) => `${f.path} #${f.example}: ${f.message}`)).toEqual([]);
  }, 600_000);
});
