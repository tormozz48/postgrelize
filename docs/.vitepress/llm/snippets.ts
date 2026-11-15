import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REGION_START = /^\s*\/\/ #region (\S+)\s*$/;
const REGION_END = /^\s*\/\/ #endregion\b/;

/** Extracts `// #region name` blocks from the runnable files in `docs/examples`. */
export class SnippetLibrary {
  readonly #examples: string;

  constructor(examplesDirectory: string) {
    this.#examples = examplesDirectory;
  }

  /** Returns the dedented body of a region; throws when the file or region is missing. */
  region(file: string, name: string): string {
    const lines = readFileSync(join(this.#examples, file), 'utf8').split('\n');
    const start = lines.findIndex((line) => REGION_START.exec(line)?.[1] === name);
    if (start === -1) {
      throw new Error(`Region "${name}" not found in docs/examples/${file}`);
    }
    return SnippetLibrary.dedent(SnippetLibrary.body(lines.slice(start + 1)));
  }

  static body(lines: readonly string[]): string[] {
    const out: string[] = [];
    let depth = 0;
    for (const line of lines) {
      if (REGION_START.test(line)) {
        depth += 1;
      } else if (REGION_END.test(line)) {
        if (depth === 0) {
          return out;
        }
        depth -= 1;
      } else {
        out.push(line);
      }
    }
    throw new Error('Unterminated region');
  }

  static dedent(lines: readonly string[]): string {
    const indents = lines.filter((line) => line.trim() !== '').map((l) => /^ */.exec(l)![0].length);
    const cut = indents.length === 0 ? 0 : Math.min(...indents);
    return lines.map((line) => line.slice(cut)).join('\n');
  }
}
