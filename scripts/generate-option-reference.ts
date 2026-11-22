import { mkdirSync, writeFileSync } from 'node:fs';
import { ExtensionsPageBuilder } from './extensions-page-lib.ts';
import { OPTION_GROUPS, UNLISTED_OPTION_TYPES, V6_RUNTIME_OPTIONS } from './option-groups.ts';
import { OptionReferenceBuilder } from './option-reference-lib.ts';

const builder = new OptionReferenceBuilder();
const failures = [
  ...builder.problems(OPTION_GROUPS),
  ...builder
    .unlisted(OPTION_GROUPS, UNLISTED_OPTION_TYPES)
    .map((name) => `${name} is an option type that no group in scripts/option-groups.ts lists`),
  ...builder
    .unclassified(OPTION_GROUPS, V6_RUNTIME_OPTIONS)
    .map(
      (name) =>
        `${name} is missing from the sequelize@6 typings: say "postgrelize extension" in its TSDoc, or add its name to V6_RUNTIME_OPTIONS`,
    ),
];
if (failures.length > 0) {
  throw new Error(`Option reference is incomplete:\n${failures.join('\n')}`);
}
const directory = 'docs/reference/options';
mkdirSync(directory, { recursive: true });
for (const group of OPTION_GROUPS) {
  writeFileSync(`${directory}/${group.slug}.md`, builder.renderGroup(group));
}
writeFileSync(
  `${directory}/index.md`,
  [
    '# Option reference',
    '',
    'Every option of every method, with its type, default and effect. Pages are generated from the TypeScript declarations and TSDoc on each build; options marked <Ext /> exist only in postgrelize.',
    '',
    ...OPTION_GROUPS.map((group) => `- [${group.title}](./${group.slug})`),
    '',
  ].join('\n'),
);

mkdirSync('docs/extensions', { recursive: true });
writeFileSync(
  'docs/extensions/index.md',
  new ExtensionsPageBuilder(
    OPTION_GROUPS,
    builder.extensionOptions(OPTION_GROUPS),
    builder.extensionValues(),
  ).render(),
);
