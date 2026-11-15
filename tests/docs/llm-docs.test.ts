import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LlmAssetBuilder } from '../../docs/.vitepress/llm/asset-builder.ts';
import { LlmsGenerator } from '../../docs/.vitepress/llm/llms-generator.ts';
import { PAGES } from '../../docs/.vitepress/llm/pages.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const docs = `${root}docs`;
const generator = new LlmsGenerator(docs);

describe('llms.txt', () => {
  it('follows the convention', () => {
    const text = generator.llmsTxt();
    expect(text.startsWith('# postgrelize\n\n> ')).toBe(true);
    for (const heading of ['## Guide', '## PostgreSQL features', '## Reference', '## API']) {
      expect(text).toContain(`\n${heading}\n`);
    }
  });

  it('lists every guide page and links each page', () => {
    const guide = readdirSync(`${docs}/guide`).map((file) => `guide/${file}`);
    const listed = PAGES.map((page) => page.file);
    expect(guide.filter((file) => !listed.includes(file))).toEqual([]);
    const text = generator.llmsTxt();
    for (const page of PAGES) {
      expect(text).toContain(`(https://tormozz48.github.io/postgrelize${page.url})`);
    }
  });

  it('is deterministic', () => {
    expect(new LlmsGenerator(docs).llmsTxt()).toBe(generator.llmsTxt());
    expect(new LlmsGenerator(docs).llmsFull()).toBe(generator.llmsFull());
  });
});

describe('llms-full.txt', () => {
  const full = generator.llmsFull();

  it('contains every page with its title as a heading', () => {
    for (const page of PAGES) {
      const source = readFileSync(`${docs}/${page.file}`, 'utf8');
      const title = /^# (.+)$/m.exec(source)?.[1] ?? 'PostgreSQL coverage';
      expect(full).toContain(`\n## ${title}\n`);
    }
  });

  it('inlines example regions and the coverage matrix', () => {
    expect(full).not.toContain('<<< @/examples');
    expect(full).not.toContain('<script setup>');
    expect(full).toContain('### SELECT');
  });

  it.runIf(existsSync(`${docs}/api/index.md`))('contains the API reference', () => {
    expect(full).toContain('\n## Class: Sequelize\n');
    expect(full).not.toContain('Defined in:');
  });
});

describe('LLM usage assets', () => {
  const assets = new LlmAssetBuilder(root).build();

  it('produces USAGE.md and the skill files', () => {
    expect([...assets.keys()].toSorted()).toEqual([
      'llm/USAGE.md',
      'skills/postgrelize/SKILL.md',
      ...[
        'associations',
        'errors',
        'migrating-from-sequelize',
        'postgresql-features',
        'querying',
        'schema',
        'security',
        'transactions-and-sessions',
        'writing',
      ].map((name) => `skills/postgrelize/reference/${name}.md`),
    ]);
  });

  it.each([...assets.keys()])('%s is up to date (run npm run llm:build)', (path) => {
    expect(readFileSync(`${root}${path}`, 'utf8')).toBe(assets.get(path));
  });

  it('keeps USAGE.md compact and free of unresolved placeholders', () => {
    const usage = assets.get('llm/USAGE.md') ?? '';
    expect(usage.split('\n').length).toBeLessThanOrEqual(450);
    for (const text of assets.values()) {
      expect(text).not.toMatch(/<<< @|\{\{/);
    }
  });

  it('has skill frontmatter with name and trigger description', () => {
    const skill = assets.get('skills/postgrelize/SKILL.md') ?? '';
    expect(skill).toMatch(/^---\nname: postgrelize\ndescription: Use when /);
  });

  it('is published in the npm package', () => {
    const { files } = JSON.parse(readFileSync(`${root}package.json`, 'utf8')) as {
      files: string[];
    };
    expect(files).toEqual(expect.arrayContaining(['llm', 'skills']));
  });
});
