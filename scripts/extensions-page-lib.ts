import {
  AREAS,
  EXTRA_FEATURES,
  POSTGRESQL_FEATURES,
  type FeatureRow,
} from '../docs/coverage/postgresql-features.ts';
import { EXTENSION_MEMBERS } from '../docs/coverage/extension-members.ts';
import type { ExtensionOptions, ExtensionValue } from './option-reference-lib.ts';
import type { OptionGroup } from './option-reference-lib.ts';

const guideLink = (guide: string): string => `[guide](/guide/${guide})`;
const exampleLink = (example: string): string =>
  `[example](https://github.com/tormozz48/postgrelize/blob/main/docs/examples/${example.split('#')[0]})`;
const firstSentence = (text: string): string => /^.*?[.!?](?=\s|$)/s.exec(text)?.[0] ?? text;
const cell = (text: string): string => text.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');

/** Renders the "Extensions" page: everything postgrelize adds to the Sequelize v6 API, from the code and the matrix. */
export class ExtensionsPageBuilder {
  readonly #groups: readonly OptionGroup[];
  readonly #options: readonly ExtensionOptions[];
  readonly #values: readonly ExtensionValue[];

  constructor(
    groups: readonly OptionGroup[],
    options: readonly ExtensionOptions[],
    values: readonly ExtensionValue[],
  ) {
    this.#groups = groups;
    this.#options = options;
    this.#values = values;
  }

  #featureTables(): string[] {
    const rows = POSTGRESQL_FEATURES.filter(
      (row: FeatureRow) => row.status === 'supported' && row.beyondV6 === true,
    );
    return AREAS.flatMap((area) => {
      const own = rows.filter((row) => row.area === area);
      return own.length === 0
        ? []
        : [
            `### ${area}`,
            '',
            '| Feature | PostgreSQL | How | Docs |',
            '| ------- | ---------- | --- | ---- |',
            ...own.map(
              (row) =>
                `| ${cell(row.feature)} | ${row.minPg}+ | ${cell(row.note)} | ${guideLink(row.guide ?? '')} · ${exampleLink(row.example ?? '')} |`,
            ),
            '',
          ];
    });
  }

  #typeLink(type: string, label: string = type): string {
    const slug = this.#groups.find((group) => group.types.includes(type))?.slug ?? '';
    return `[${label === type ? type : `\`${label}\``}](/reference/options/${slug}#${type.toLowerCase()})`;
  }

  #optionLines(): string[] {
    const byOption = new Map<string, string[]>();
    for (const entry of this.#options) {
      for (const name of entry.names) {
        byOption.set(name, [...(byOption.get(name) ?? []), entry.type]);
      }
    }
    const whole = this.#options
      .filter((entry) => entry.whole)
      .map((entry) => this.#typeLink(entry.type));
    return [
      '| Option | Accepted by |',
      '| ------ | ----------- |',
      ...[...byOption].map(
        ([name, types]) =>
          `| ${this.#typeLink(types[0]!, name)} | ${types.map((type) => `\`${type}\``).join(', ')} |`,
      ),
      '',
      '### Option types that only exist in postgrelize',
      '',
      whole.join(', '),
    ];
  }

  /** The whole page. */
  render(): string {
    return [
      '# postgrelize extensions',
      '',
      'Everything on this page is **not in Sequelize v6**. Sequelize v6 behaviour never changes (see [Migrating](/guide/migrating)); extensions are new options, methods and helpers, marked <Ext /> wherever they appear in the docs. This page is generated from the code (the option lists compare postgrelize with the `sequelize@6` types) and from the [PostgreSQL coverage](/postgresql-coverage) matrix.',
      '',
      '## Features',
      '',
      ...this.#featureTables(),
      '### Other extensions',
      '',
      '| Feature | Docs |',
      '| ------- | ---- |',
      ...EXTRA_FEATURES.map(
        (item) =>
          `| ${cell(item.feature)} | ${guideLink(item.guide)} · ${exampleLink(item.example)} |`,
      ),
      '',
      '## Methods',
      '',
      '| Method | What it does | Docs |',
      '| ------ | ------------ | ---- |',
      ...EXTENSION_MEMBERS.map(
        (item) => `| \`${item.member}\` | ${cell(item.summary)} | ${guideLink(item.guide)} |`,
      ),
      '',
      '## Options that v6 does not have',
      '',
      'Options of the same-named Sequelize v6 option types that only postgrelize accepts. Descriptions, types and defaults are in the [option reference](/reference/options/).',
      '',
      ...this.#optionLines(),
      '',
      '## Helper functions and constants',
      '',
      'Exports of `postgrelize` that `sequelize` does not have. Full signatures are in the [API reference](/api/).',
      '',
      '| Export | What it does |',
      '| ------ | ------------ |',
      ...this.#values.map((item) => `| \`${item.name}\` | ${cell(firstSentence(item.summary))} |`),
      '',
    ].join('\n');
  }
}
