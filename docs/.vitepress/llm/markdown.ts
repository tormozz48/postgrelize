import type { SnippetLibrary } from './snippets.ts';

const INCLUDE = /^<<< @\/examples\/([\w-]+\.ts)#([\w-]+)(?:\{(\w+)\})?\s*$/;

/** Text transformations that turn VitePress markdown into plain markdown for LLMs. */
export class MarkdownTools {
  readonly #snippets: SnippetLibrary;

  constructor(snippets: SnippetLibrary) {
    this.#snippets = snippets;
  }

  /** Removes the YAML front matter and `<script setup>` blocks. */
  clean(markdown: string): string {
    return markdown
      .replace(/^---\n[\s\S]*?\n---\n/, '')
      .replace(/<script setup>[\s\S]*?<\/script>\n?/, '')
      .trim();
  }

  /** Replaces `<<< @/examples/file.ts#region{ts}` lines with fenced code blocks. */
  inlineSnippets(markdown: string): string {
    return markdown
      .split('\n')
      .map((line) => {
        const match = INCLUDE.exec(line);
        if (match === null) {
          return line;
        }
        const code = this.#snippets.region(match[1]!, match[2]!);
        return `\`\`\`${match[3] ?? 'ts'}\n${code}\n\`\`\``;
      })
      .join('\n');
  }

  /** Splits the first `# Title` off the page; the remaining headings move one level down. */
  static splitTitle(markdown: string, fallback: string): { title: string; body: string } {
    const lines = markdown.split('\n');
    const index = lines.findIndex((line) => line.startsWith('# '));
    const title = index === -1 ? fallback : lines[index]!.slice(2).trim();
    const rest = index === -1 ? lines : lines.filter((_, i) => i !== index);
    return { title, body: MarkdownTools.demote(rest.join('\n')).trim() };
  }

  static demote(markdown: string): string {
    let fenced = false;
    return markdown
      .split('\n')
      .map((line) => {
        if (line.startsWith('```')) {
          fenced = !fenced;
        }
        return !fenced && /^#{1,5} /.test(line) ? `#${line}` : line;
      })
      .join('\n');
  }
}
