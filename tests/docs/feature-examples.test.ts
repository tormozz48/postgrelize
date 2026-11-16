import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  EXTRA_FEATURES,
  POSTGRESQL_FEATURES,
  type FeatureRow,
} from '../../docs/coverage/postgresql-features.ts';

// Every feature that Sequelize v6 lacks needs a runnable example and a guide section that shows it.
// The examples themselves run in `examples.test.ts`; this file checks the links between the pieces.
const root = new URL('../../', import.meta.url);

type Target = Readonly<{ name: string; example?: string; guide?: string }>;

// Known gaps: features that still lack an example. The list only shrinks (checked below).
const KNOWN_GAPS: readonly string[] = [
  'ORDER BY … NULLS FIRST / LAST',
  'INSERT … OVERRIDING SYSTEM / USER VALUE',
  '= ANY($1) for long IN lists',
];

const supported = POSTGRESQL_FEATURES.filter((row) => row.status === 'supported');
const targets: readonly Target[] = [
  ...supported.filter((row: FeatureRow) => row.beyondV6 === true),
  ...EXTRA_FEATURES,
].map((item) => ({ name: item.feature, example: item.example, guide: item.guide }));

const slugify = (heading: string): string =>
  heading
    .replace(/\{#[^}]+\}\s*$/, '')
    .replace(/[\s~`!@#$%^&*()\-_+=[\]{}|;:"'“”‘’<>,.?/…]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

const guideFile = (page: string): URL | undefined =>
  [`docs/guide/${page}.md`, `docs/${page}.md`]
    .map((path) => new URL(path, root))
    .find((url) => existsSync(url));

/** Text of the section whose heading has the anchor, up to the next heading of the same or a higher level. */
const section = (markdown: string, anchor: string): string | undefined => {
  const lines = markdown.split('\n');
  let inFence = false;
  const headings = lines.flatMap((line, index) => {
    if (line.startsWith('```')) {
      inFence = !inFence;
    }
    const match = inFence ? null : /^(#{1,6})\s+(.*)$/.exec(line);
    return match === null ? [] : [{ index, level: match[1]!.length, text: match[2]! }];
  });
  const at = headings.findIndex(
    (h) => h.text.match(/\{#([^}]+)\}\s*$/)?.[1] === anchor || slugify(h.text) === anchor,
  );
  if (at < 0) {
    return undefined;
  }
  const start = headings[at]!;
  const next = headings.slice(at + 1).find((h) => h.level <= start.level);
  return lines.slice(start.index, next?.index ?? lines.length).join('\n');
};

const problems = (target: Target): string[] => {
  if (target.example === undefined || target.guide === undefined) {
    return [`${target.name}: needs both \`example\` and \`guide\``];
  }
  const [file = '', region = ''] = target.example.split('#');
  const [page = '', anchor = ''] = target.guide.split('#');
  const exampleUrl = new URL(`docs/examples/${file}`, root);
  if (!existsSync(exampleUrl)) {
    return [`${target.name}: docs/examples/${file} does not exist`];
  }
  const source = readFileSync(exampleUrl, 'utf8');
  const found: string[] = [];
  if (!/export (const|async function|function) run\b/.test(source)) {
    found.push(`${target.name}: ${file} does not export run`);
  }
  if (!source.includes(`// #region ${region}\n`)) {
    found.push(`${target.name}: region "${region}" not found in ${file}`);
  }
  const pageUrl = guideFile(page);
  if (pageUrl === undefined) {
    return [...found, `${target.name}: guide page "${page}" does not exist`];
  }
  const body = section(readFileSync(pageUrl, 'utf8'), anchor);
  if (body === undefined) {
    return [...found, `${target.name}: anchor "${anchor}" not found in ${page}`];
  }
  return body.includes(`<<< @/examples/${file}#${region}`)
    ? found
    : [
        ...found,
        `${target.name}: section "${anchor}" of ${page} does not include ${target.example}`,
      ];
};

describe('beyond-v6 features have an example and a guide section', () => {
  it('decides for every supported matrix row whether v6 has it', () => {
    expect(
      supported.filter((row) => typeof row.beyondV6 !== 'boolean').map((r) => r.feature),
    ).toEqual([]);
  });

  it('links every beyond-v6 feature to a run-able example included in its guide section', () => {
    const open = targets.filter((target) => !KNOWN_GAPS.includes(target.name));
    expect(open.flatMap(problems)).toEqual([]);
  });

  it('keeps the known-gap list honest: it only names features that still lack an example', () => {
    const names = new Set(targets.map((target) => target.name));
    expect(KNOWN_GAPS.filter((name) => !names.has(name))).toEqual([]);
    const fixed = targets.filter(
      (target) => KNOWN_GAPS.includes(target.name) && problems(target).length === 0,
    );
    expect(fixed.map((target) => target.name)).toEqual([]);
  });
});
