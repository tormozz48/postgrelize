import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LlmsGenerator } from './llms-generator.ts';

/** Writes `llms.txt` and `llms-full.txt` next to the built `index.html`. */
export class LlmsWriter {
  readonly #generator: LlmsGenerator;
  readonly #out: string;

  constructor(docsDirectory: string, outDirectory: string) {
    this.#generator = new LlmsGenerator(docsDirectory);
    this.#out = outDirectory;
  }

  write(): void {
    mkdirSync(this.#out, { recursive: true });
    writeFileSync(join(this.#out, 'llms.txt'), this.#generator.llmsTxt());
    writeFileSync(join(this.#out, 'llms-full.txt'), this.#generator.llmsFull());
  }
}
