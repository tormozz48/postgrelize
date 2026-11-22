import ts from 'typescript';
import { fileURLToPath } from 'node:url';

const root = (path: string): string => fileURLToPath(new URL(`../../${path}`, import.meta.url));

/** Entry file of the Sequelize v6 declarations and of postgrelize. */
export const ENTRIES = {
  v6: root('node_modules/sequelize/types/index.d.ts'),
  postgrelize: root('src/index.ts'),
} as const;

export type Library = keyof typeof ENTRIES;

const options: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  skipLibCheck: true,
  allowImportingTsExtensions: true,
  noEmit: true,
  types: [],
};

/** Exported names and the property names of exported option types of a library, read with the TypeScript compiler API. */
export class TypeSurface {
  readonly #checker: ts.TypeChecker;
  readonly #exports: ReadonlyMap<string, ts.Symbol>;

  /**
   * @param library - Which declarations to read.
   */
  constructor(library: Library) {
    const file = ENTRIES[library];
    const program = ts.createProgram([file], options);
    this.#checker = program.getTypeChecker();
    const source = program.getSourceFile(file);
    const module = source === undefined ? undefined : this.#checker.getSymbolAtLocation(source);
    this.#exports = new Map(
      module === undefined
        ? []
        : this.#checker.getExportsOfModule(module).map((symbol) => [symbol.name, symbol]),
    );
  }

  /**
   * Names exported from the entry file.
   *
   * @returns Export names.
   */
  names(): ReadonlySet<string> {
    return new Set(this.#exports.keys());
  }

  /**
   * Property names of an exported type, or `undefined` when the name is not an exported type.
   *
   * @param name - Exported name.
   * @returns Property names.
   */
  keys(name: string): readonly string[] | undefined {
    const symbol = this.#exports.get(name);
    if (symbol === undefined) {
      return undefined;
    }
    const target =
      symbol.flags & ts.SymbolFlags.Alias ? this.#checker.getAliasedSymbol(symbol) : symbol;
    const type = this.#checker.getDeclaredTypeOfSymbol(target);
    return this.#checker
      .getPropertiesOfType(this.#checker.getApparentType(type))
      .map((property) => property.name);
  }
}
