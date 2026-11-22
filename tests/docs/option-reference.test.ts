import { describe, expect, it } from 'vitest';
import {
  OPTION_GROUPS,
  UNLISTED_OPTION_TYPES,
  V6_RUNTIME_MEMBERS,
  V6_RUNTIME_OPTIONS,
} from '../../scripts/option-groups.ts';
import { OptionReferenceBuilder } from '../../scripts/option-reference-lib.ts';

// The option reference pages are generated from the TypeScript declarations. These checks make the
// generation fail loudly (and in CI) when a new option arrives without a description or a decision on
// whether Sequelize v6 has it.
const builder = new OptionReferenceBuilder();

describe('option reference', () => {
  it('lists only exported option types whose options all have a TSDoc description', () => {
    expect(builder.problems(OPTION_GROUPS)).toEqual([]);
  });

  it('lists every exported *Options type on some page (or ignores it on purpose)', () => {
    expect(builder.unlisted(OPTION_GROUPS, UNLISTED_OPTION_TYPES)).toEqual([]);
  });

  it('says for every option missing from the sequelize@6 typings whether it is an extension', () => {
    expect(builder.unclassified(OPTION_GROUPS, V6_RUNTIME_OPTIONS)).toEqual([]);
  });

  it('says for every Model / Sequelize / Transaction / QueryInterface member missing from v6 whether it is an extension', () => {
    expect(builder.unclassifiedMembers(V6_RUNTIME_MEMBERS)).toEqual([]);
  });

  it('lists tagged methods and helpers for the Extensions page', () => {
    expect(builder.extensionMembers().map((item) => item.name)).toContain('Model.insert');
    expect(builder.extensionValues().map((item) => item.name)).toContain('excluded');
    expect(builder.extensionMembers().map((item) => item.name)).not.toContain('Model.findAll');
  });

  it('renders a table per type, with extension badges', () => {
    const page = builder.renderGroup(OPTION_GROUPS[0]!);
    expect(page).toContain('## FindOptions');
    expect(page).toMatch(/\| `distinctOn` <Ext \/> \|/);
    expect(page).not.toMatch(/\| `limit` <Ext \/> \|/);
  });
});
