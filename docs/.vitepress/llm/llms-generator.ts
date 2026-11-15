import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CoverageMarkdown } from './coverage-markdown.ts';
import { MarkdownTools } from './markdown.ts';
import { PAGES, SITE, type DocPage } from './pages.ts';
import { SnippetLibrary } from './snippets.ts';

const API_KINDS = ['classes', 'functions', 'interfaces', 'type-aliases', 'variables'] as const;
const API_HIGHLIGHTS = ['classes/Sequelize', 'classes/Model', 'classes/QueryInterface', 'classes/Transaction'];
const SUMMARY =
  'PostgreSQL-only ORM for Node.js and TypeScript that implements the Sequelize v6 public API (drop-in) and adds PostgreSQL features: ON CONFLICT upserts, MERGE, CTEs, COPY, LISTEN/NOTIFY, advisory locks, read replicas, RETURNING old values.';

/** Builds the `llms.txt` index and the `llms-full.txt` concatenation from the docs sources. */
export class LlmsGenerator {
  readonly #docs: string;
  readonly #markdown: MarkdownTools;
  readonly #coverage = new CoverageMarkdown();

  constructor(docsDirectory: string) {
    this.#docs = docsDirectory;
    this.#markdown = new MarkdownTools(new SnippetLibrary(join(docsDirectory, 'examples')));
  }

  /** The link index following the llms.txt convention. */
  llmsTxt(): string {
    const sections = ['Guide', 'PostgreSQL features', 'Reference'] as const;
    const blocks = sections.map((section) => {
      const links = PAGES.filter((page) => page.section === section).map((page) => this.#link(page));
      return `## ${section}\n\n${links.join('\n')}`;
    });
    return [
      `# postgrelize\n\n> ${SUMMARY}`,
      `Everything below is also available as one file: [llms-full.txt](${SITE}/llms-full.txt).`,
      ...blocks,
      `## API\n\n${this.#apiLinks().join('\n')}`,
      `## Optional\n\n- [Usage cheat sheet in the npm package](https://github.com/tormozz48/postgrelize/blob/main/llm/USAGE.md): one file for agents that only see \`node_modules\`\n- [Agent Skill](https://github.com/tormozz48/postgrelize/tree/main/skills/postgrelize): SKILL.md with reference files`,
    ].join('\n\n') + '\n';
  }

  /** All guide pages, reference pages and the API reference in one markdown document. */
  llmsFull(): string {
    const parts = [
      `# postgrelize\n\n> ${SUMMARY}`,
      '# Guide and reference',
      ...PAGES.map((page) => this.#page(page)),
      '# API reference',
      ...this.#apiPages(),
    ];
    return parts.join('\n\n') + '\n';
  }

  #link(page: DocPage): string {
    const title = this.#title(page);
    return `- [${title}](${SITE}${page.url}): ${page.description}`;
  }

  #title(page: DocPage): string {
    return MarkdownTools.splitTitle(this.#read(page.file), page.url).title;
  }

  #read(file: string): string {
    const raw = readFileSync(join(this.#docs, file), 'utf8');
    return file === 'postgresql-coverage.md' ? '# PostgreSQL coverage' : this.#markdown.clean(raw);
  }

  #page(page: DocPage): string {
    const source = this.#markdown.inlineSnippets(this.#read(page.file));
    const { title, body } = MarkdownTools.splitTitle(source, page.url);
    const extra = page.file === 'postgresql-coverage.md' ? this.#coverage.full() : body;
    return `## ${title}\n\nSource: ${SITE}${page.url}\n\n${extra}`;
  }

  #apiFiles(): string[] {
    return API_KINDS.flatMap((kind) => {
      const directory = join(this.#docs, 'api', kind);
      if (!existsSync(directory)) {
        return [];
      }
      return readdirSync(directory)
        .filter((name) => name.endsWith('.md'))
        .toSorted()
        .map((name) => `${kind}/${name.slice(0, -3)}`);
    });
  }

  #apiLinks(): string[] {
    const known = new Set(this.#apiFiles());
    const links = API_HIGHLIGHTS.filter((name) => known.has(name)).map(
      (name) => `- [${name.split('/')[1]}](${SITE}/api/${name}): API reference page`,
    );
    return [`- [API reference index](${SITE}/api/): all exports by kind`, ...links];
  }

  #apiPages(): string[] {
    return this.#apiFiles().map((name) => {
      const raw = readFileSync(join(this.#docs, 'api', `${name}.md`), 'utf8');
      const text = raw
        .split('\n')
        .filter((line) => !line.startsWith('[postgrelize](') && !line.startsWith('Defined in:'))
        .join('\n');
      const { title, body } = MarkdownTools.splitTitle(text, name);
      return `## ${title}\n\n${body}`;
    });
  }
}
