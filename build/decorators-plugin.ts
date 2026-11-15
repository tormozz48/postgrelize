import ts from 'typescript';
import type { Plugin } from 'vite';

// Decorators are written on their own line (oxfmt layout); TSDoc tags start with `*` and never match.
const DECORATOR = /^\s*@[A-Za-z_$]/m;

/**
 * Lowers TC39 standard decorators with the TypeScript compiler (ADR-021). oxc, which Vite and
 * Vitest use for TypeScript, only lowers legacy decorators; files without decorators are left
 * to oxc.
 */
export const decoratorsPlugin = (): Plugin => ({
  name: 'postgrelize:tc39-decorators',
  enforce: 'pre',
  transform(code, id) {
    if (!/\.m?ts$/.test(id) || id.includes('/node_modules/') || !DECORATOR.test(code)) {
      return null;
    }
    const output = ts.transpileModule(code, {
      fileName: id,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        verbatimModuleSyntax: true,
        sourceMap: true,
        inlineSources: true,
      },
    });
    return {
      code: output.outputText.replace(/\n\/\/# sourceMappingURL=.*$/, ''),
      map: output.sourceMapText ?? null,
    };
  },
});
