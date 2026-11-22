import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { ExtensionsPageBuilder } from './extensions-page-lib.ts';
import {
  OPTION_GROUPS,
  UNLISTED_OPTION_TYPES,
  V6_RUNTIME_MEMBERS,
  V6_RUNTIME_OPTIONS,
} from './option-groups.ts';
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
        `${name} is missing from the sequelize@6 typings: tag it @postgrelize in its TSDoc, or add its name to V6_RUNTIME_OPTIONS`,
    ),
  ...builder
    .unclassifiedMembers(V6_RUNTIME_MEMBERS)
    .map(
      (name) =>
        `${name} is missing from the sequelize@6 typings: tag it @postgrelize, or add it to V6_RUNTIME_MEMBERS`,
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
    builder.extensionMembers(),
    builder.extensionValues(),
  ).render(),
);

// TypeDoc renders the `@postgrelize` modifier as a bold label; show the same badge as the guide instead.
if (existsSync('docs/api')) {
  for (const entry of readdirSync('docs/api', { recursive: true, encoding: 'utf8' })) {
    if (entry.endsWith('.md')) {
      const file = `docs/api/${entry}`;
      const text = readFileSync(file, 'utf8');
      if (text.includes('**`Postgrelize`**')) {
        writeFileSync(file, text.replaceAll('**`Postgrelize`**', '<Ext />'));
      }
    }
  }
}
