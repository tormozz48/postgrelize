import { dirname, resolve } from 'node:path';
import ts from 'typescript';
import type { DocItem } from './tsdoc-model.ts';

const MODELS = ['User', 'Post', 'Profile', 'Tag', 'Product', 'Project', 'Task', 'Invoice'];

export interface ExampleFailure {
  readonly path: string;
  readonly example: number;
  readonly message: string;
}

interface Snippet {
  readonly file: string;
  readonly path: string;
  readonly example: number;
  readonly code: string;
  readonly offset: number;
}

const FENCE = /```(?:ts|typescript)\n([\s\S]*?)```/g;

export const codeBlocks = (example: string): string[] =>
  [...example.matchAll(FENCE)].map((m) => m[1] ?? '');

/** Type-checks TSDoc `@example` blocks against the current public API (nothing is executed). */
export class ExampleCompiler {
  private readonly root = resolve(import.meta.dirname, '../../..');

  private readonly names: string[];

  constructor(exportedNames: readonly string[]) {
    // Exports named like a global (`JSON`, `Error`) must not shadow it inside snippets.
    this.names = [...new Set(exportedNames)].filter((name) => !(name in globalThis));
  }

  /** Names every snippet may use without importing: all public exports, `sequelize`, and the guide's models. */
  prelude(): string {
    const entry = resolve(this.root, 'src/index.ts');
    const models = MODELS.filter((n) => !this.names.includes(n)).map(
      (n) => `declare class ${n} extends Model<any, any> { [key: string]: any }`,
    );
    return [
      `import { ${this.names.join(', ')} } from '${entry}';`,
      ...models,
      'declare const sequelize: Sequelize;',
      'declare const queryInterface: QueryInterface;',
      'declare const transaction: Transaction;',
      'declare const user: User;',
      'declare const users: User[];',
      'declare const post: Post;',
    ].join('\n');
  }

  check(items: readonly DocItem[]): ExampleFailure[] {
    const snippets = this.snippets(items);
    const files = new Map(snippets.map((s) => [s.file, this.source(s)]));
    const program = this.program(files);
    return snippets.flatMap((s) => this.diagnostics(program, s));
  }

  private snippets(items: readonly DocItem[]): Snippet[] {
    const dir = resolve(this.root, '.tsdoc-examples');
    const prelude = this.prelude();
    let id = 0;
    return items.flatMap((item) =>
      item.examples.flatMap((example, index) => {
        const blocks = codeBlocks(example);
        const list = blocks.length > 0 ? blocks : [''];
        return list.map((code) => ({
          file: resolve(dir, `ex-${id++}.ts`),
          path: item.path,
          example: index + 1,
          code,
          offset: prelude.split('\n').length + 1,
        }));
      }),
    );
  }

  private source(snippet: Snippet): string {
    return `${this.prelude()}\nexport async function __example() {\n${snippet.code}\n}\n`;
  }

  private program(files: Map<string, string>): ts.Program {
    const configPath = resolve(this.root, 'tsconfig.json');
    const config = ts.readConfigFile(configPath, ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(configPath));
    const options: ts.CompilerOptions = {
      ...parsed.options,
      verbatimModuleSyntax: false,
      isolatedModules: false,
      noEmit: true,
      noUnusedLocals: false,
    };
    const host = ts.createCompilerHost(options);
    const original = host.getSourceFile.bind(host);
    host.getSourceFile = (name, lang, ...rest) => {
      const text = files.get(name);
      return text === undefined
        ? original(name, lang, ...rest)
        : ts.createSourceFile(name, text, lang, true);
    };
    const exists = host.fileExists.bind(host);
    host.fileExists = (name) => files.has(name) || exists(name);
    return ts.createProgram([...files.keys()], options, host);
  }

  private diagnostics(program: ts.Program, snippet: Snippet): ExampleFailure[] {
    const source = program.getSourceFile(snippet.file);
    if (source === undefined)
      return [{ path: snippet.path, example: snippet.example, message: 'not compiled' }];
    if (snippet.code === '')
      return [{ path: snippet.path, example: snippet.example, message: 'no ```ts code block' }];
    return [
      ...program.getSyntacticDiagnostics(source),
      ...program.getSemanticDiagnostics(source),
    ].map((d) => {
      const line =
        d.start === undefined
          ? 0
          : source.getLineAndCharacterOfPosition(d.start).line + 1 - snippet.offset;
      const text = ts.flattenDiagnosticMessageText(d.messageText, ' ');
      return {
        path: snippet.path,
        example: snippet.example,
        message: `line ${line}: TS${d.code} ${text}`,
      };
    });
  }
}
