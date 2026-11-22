import ts from 'typescript';
import { ENTRIES, type Library } from './type-surface.ts';

const options: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  skipLibCheck: true,
  allowImportingTsExtensions: true,
  strict: true,
  noEmit: true,
  types: [],
};

type Shape = Readonly<{ min: number; max: number; rest: boolean }>;

/** One difference between the v6 declarations and postgrelize's. */
export type Difference = Readonly<{ kind: 'member' | 'generic' | 'arity' | 'kind'; key: string }>;

const kindOf = (symbol: ts.Symbol): string => {
  const f = symbol.flags;
  if (f & ts.SymbolFlags.Class) return 'class';
  if (f & ts.SymbolFlags.Interface) return 'interface';
  if (f & ts.SymbolFlags.TypeAlias) return 'type';
  if (f & ts.SymbolFlags.Enum) return 'enum';
  if (f & ts.SymbolFlags.Function) return 'function';
  if (f & ts.SymbolFlags.Variable) return 'variable';
  return f & ts.SymbolFlags.Namespace ? 'namespace' : 'other';
};

// An interface that became a type alias, a function that became a const and an enum that became a
// const object are source-compatible for consumers, so they are not differences.
const COMPATIBLE_KINDS = new Set(['interface -> type', 'function -> variable', 'enum -> variable']);
const sameKind = (a: string, b: string): boolean => a === b || COMPATIBLE_KINDS.has(`${a} -> ${b}`);

// Symbol-keyed members (`__@eq@1135`) and underscore members are internals, not API.
const skipMember = (name: string): boolean => name.startsWith('__@') || name.startsWith('_');

/** Compares the exported classes and interfaces of two declaration entry files with the TypeScript compiler API. */
export class TypeDiff {
  readonly #a: Side;
  readonly #b: Side;

  /**
   * @param reference - Library read as the reference (v6).
   * @param candidate - Library compared against it (postgrelize).
   */
  constructor(reference: Library, candidate: Library) {
    this.#a = new Side(ENTRIES[reference]);
    this.#b = new Side(ENTRIES[candidate]);
  }

  /**
   * Differences for every name exported by both libraries: kind, generics, missing members and arity.
   *
   * @param skip - Names to leave out (already tracked elsewhere, e.g. the validator.js `Validator` interface).
   * @returns Sorted differences, one per key.
   */
  differences(skip: ReadonlySet<string>): readonly Difference[] {
    const out: Difference[] = [];
    for (const [name, symbolA] of this.#a.exports) {
      const symbolB = this.#b.exports.get(name);
      if (symbolB === undefined || skip.has(name)) continue;
      const a = this.#a.resolve(symbolA);
      const b = this.#b.resolve(symbolB);
      if (!sameKind(kindOf(a), kindOf(b)))
        out.push({ kind: 'kind', key: `${name}: ${kindOf(a)} -> ${kindOf(b)}` });
      const generics = [this.#a.generics(a), this.#b.generics(b)] as const;
      if (generics[0] !== generics[1])
        out.push({ kind: 'generic', key: `${name}: <${generics[0]}> -> <${generics[1]}>` });
      if (kindOf(a) === 'class' || kindOf(a) === 'interface') this.#members(name, a, b, out);
    }
    return out.toSorted((x, y) => `${x.kind} ${x.key}`.localeCompare(`${y.kind} ${y.key}`));
  }

  #members(name: string, a: ts.Symbol, b: ts.Symbol, out: Difference[]): void {
    const ma = this.#a.members(a);
    const mb = this.#b.members(b);
    for (const [member, symbol] of ma) {
      const other = mb.get(member);
      if (other === undefined) {
        out.push({ kind: 'member', key: `${name}.${member}` });
        continue;
      }
      const arity = arityDifference(this.#a.shape(symbol), this.#b.shape(other));
      if (arity !== undefined) out.push({ kind: 'arity', key: `${name}.${member}: ${arity}` });
    }
  }
}

const arityDifference = (a: Shape | undefined, b: Shape | undefined): string | undefined => {
  if (a === undefined) return undefined;
  if (b === undefined) return 'callable -> not callable';
  if (!b.rest && b.max < a.max) return `max ${a.max} -> ${b.max}`;
  return b.min > a.min ? `min ${a.min} -> ${b.min}` : undefined;
};

class Side {
  readonly checker: ts.TypeChecker;
  readonly exports: ReadonlyMap<string, ts.Symbol>;

  constructor(file: string) {
    const program = ts.createProgram([file], options);
    this.checker = program.getTypeChecker();
    const source = program.getSourceFile(file);
    const module = source === undefined ? undefined : this.checker.getSymbolAtLocation(source);
    this.exports = new Map(
      module === undefined ? [] : this.checker.getExportsOfModule(module).map((s) => [s.name, s]),
    );
  }

  resolve(symbol: ts.Symbol): ts.Symbol {
    return symbol.flags & ts.SymbolFlags.Alias ? this.checker.getAliasedSymbol(symbol) : symbol;
  }

  generics(symbol: ts.Symbol): string {
    const declaration = symbol.declarations?.find(
      (d) => 'typeParameters' in d && d.typeParameters !== undefined,
    );
    const params = (declaration as ts.ClassDeclaration | undefined)?.typeParameters ?? [];
    return params.map((p) => (p.default === undefined ? '_' : '=')).join(',');
  }

  members(symbol: ts.Symbol): ReadonlyMap<string, ts.Symbol> {
    const out = new Map<string, ts.Symbol>();
    const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
    if (declaration === undefined) return out;
    const instance = this.checker.getDeclaredTypeOfSymbol(symbol);
    for (const p of this.checker.getPropertiesOfType(instance)) out.set(p.name, p);
    if (symbol.flags & ts.SymbolFlags.Class) {
      const constructor = this.checker.getTypeOfSymbolAtLocation(symbol, declaration);
      for (const p of this.checker.getPropertiesOfType(constructor)) {
        if (p.name !== 'prototype') out.set(`static ${p.name}`, p);
      }
    }
    for (const name of out.keys()) if (skipMember(name.replace('static ', ''))) out.delete(name);
    return out;
  }

  shape(symbol: ts.Symbol): Shape | undefined {
    const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
    if (declaration === undefined) return undefined;
    const signatures = this.checker
      .getTypeOfSymbolAtLocation(symbol, declaration)
      .getCallSignatures();
    if (signatures.length === 0) return undefined;
    const shapes = signatures.map((signature) => {
      const parameters = signature
        .getParameters()
        .map((p) => p.valueDeclaration as ts.ParameterDeclaration | undefined);
      const rest = parameters.some((d) => d?.dotDotDotToken !== undefined);
      const required = parameters.filter(
        (d) =>
          d !== undefined &&
          d.questionToken === undefined &&
          d.initializer === undefined &&
          d.dotDotDotToken === undefined,
      ).length;
      return { min: required, max: parameters.length, rest };
    });
    return {
      min: Math.min(...shapes.map((s) => s.min)),
      max: Math.max(...shapes.map((s) => s.max)),
      rest: shapes.some((s) => s.rest),
    };
  }
}
