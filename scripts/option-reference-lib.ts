import ts from 'typescript';

/** One page of the generated option reference: a title, a lead paragraph and the option types it lists. */
export type OptionGroup = Readonly<{
  slug: string;
  title: string;
  lead: string;
  types: readonly string[];
}>;

/** postgrelize type names that Sequelize v6 declares under another name. */
const V6_NAMES: Readonly<Record<string, string>> = {
  SequelizeOptions: 'Options',
  DefineOptions: 'ModelOptions',
  AttributeOptions: 'ModelAttributeColumnOptions',
};

type TypeInfo = Readonly<{ checker: ts.TypeChecker; type: ts.Type; symbol: ts.Symbol }>;

const EXTENSION_TEXT = /\b(?:postgrelize|PostgreSQL) extension\b/i;

/** Options of one type that Sequelize v6 lacks; `whole` when the entire type is new. */
export type ExtensionOptions = Readonly<{ type: string; whole: boolean; names: readonly string[] }>;

/** A value exported by postgrelize (helper function or constant) that `sequelize@6` does not export. */
export type ExtensionValue = Readonly<{ name: string; summary: string }>;

/** Reads option types from postgrelize and from the `sequelize@6` declarations and renders reference tables. */
export class OptionReferenceBuilder {
  readonly #own: Map<string, TypeInfo>;
  readonly #v6: Map<string, TypeInfo>;
  readonly #v6Exports: Set<string>;
  readonly #ownValues: ExtensionValue[];

  constructor(root: string = process.cwd()) {
    const config = ts.readConfigFile(`${root}/tsconfig.build.json`, ts.sys.readFile);
    const options = {
      ...ts.parseJsonConfigFileContent(config.config, ts.sys, root).options,
      noEmit: true,
    };
    this.#own = OptionReferenceBuilder.#load(`${root}/src/index.ts`, options);
    this.#v6 = OptionReferenceBuilder.#load(
      `${root}/node_modules/sequelize/types/index.d.ts`,
      options,
    );
    this.#v6Exports = new Set(
      OptionReferenceBuilder.#exports(
        `${root}/node_modules/sequelize/types/index.d.ts`,
        options,
        false,
      ).map((entry) => entry.name),
    );
    this.#ownValues = OptionReferenceBuilder.#exports(`${root}/src/index.ts`, options, true).filter(
      (entry) => /^[a-z]/.test(entry.name) || /^[A-Z_]+$/.test(entry.name),
    );
  }

  static #load(entry: string, options: ts.CompilerOptions): Map<string, TypeInfo> {
    const program = ts.createProgram([entry], options);
    const checker = program.getTypeChecker();
    const source = program.getSourceFile(entry);
    const module = source === undefined ? undefined : checker.getSymbolAtLocation(source);
    const result = new Map<string, TypeInfo>();
    for (const exported of module === undefined ? [] : checker.getExportsOfModule(module)) {
      const symbol =
        (exported.flags & ts.SymbolFlags.Alias) === 0
          ? exported
          : checker.getAliasedSymbol(exported);
      if ((symbol.flags & (ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias)) !== 0) {
        result.set(exported.name, {
          checker,
          symbol,
          type: checker.getDeclaredTypeOfSymbol(symbol),
        });
      }
    }
    return result;
  }

  static #exports(
    entry: string,
    options: ts.CompilerOptions,
    onlyValues: boolean,
  ): ExtensionValue[] {
    const program = ts.createProgram([entry], options);
    const checker = program.getTypeChecker();
    const source = program.getSourceFile(entry);
    const module = source === undefined ? undefined : checker.getSymbolAtLocation(source);
    return (module === undefined ? [] : checker.getExportsOfModule(module))
      .map((exported) => ({
        name: exported.name,
        symbol:
          (exported.flags & ts.SymbolFlags.Alias) === 0
            ? exported
            : checker.getAliasedSymbol(exported),
      }))
      .filter(
        ({ symbol }) =>
          !onlyValues || (symbol.flags & (ts.SymbolFlags.Variable | ts.SymbolFlags.Function)) !== 0,
      )
      .map(({ name, symbol }) => ({
        name,
        summary: ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim(),
      }));
  }

  /** Public properties of a type that are not marked `@internal`. */
  #properties(info: TypeInfo): ts.Symbol[] {
    return info.checker
      .getPropertiesOfType(info.type)
      .filter((property) => !property.getJsDocTags().some((tag) => tag.name === 'internal'));
  }

  /** Whether the type is a plain object type that lists its own options (not a union of shapes). */
  #isOptionBag(info: TypeInfo): boolean {
    return !info.type.isUnion() && this.#properties(info).length > 0;
  }

  /** Names of listed types that do not exist, are not option bags, or have options without a description. */
  problems(groups: readonly OptionGroup[]): string[] {
    return groups.flatMap((group) =>
      group.types.flatMap((name) => {
        const info = this.#own.get(name);
        if (info === undefined || !this.#isOptionBag(info)) {
          return [`${group.slug}: ${name} is not an exported option type`];
        }
        return this.#properties(info)
          .filter((property) => this.#describe(info, property) === '')
          .map((property) => `${name}.${property.name} has no TSDoc description`);
      }),
    );
  }

  /** Exported option-like types (`*Options`) that no group lists, so new ones cannot be forgotten. */
  unlisted(groups: readonly OptionGroup[], ignored: readonly string[]): string[] {
    const listed = new Set(groups.flatMap((group) => group.types));
    return [...this.#own.keys()].filter(
      (name) =>
        name.endsWith('Options') &&
        !listed.has(name) &&
        !ignored.includes(name) &&
        !name.endsWith('MixinOptions') &&
        this.#isOptionBag(this.#own.get(name)!),
    );
  }

  #typeSummary(info: TypeInfo): string {
    return ts.displayPartsToString(info.symbol.getDocumentationComment(info.checker)).trim();
  }

  #isExtension(info: TypeInfo, property: ts.Symbol): boolean {
    return EXTENSION_TEXT.test(this.#describe(info, property));
  }

  /** Options (and whole types) whose TSDoc says they are postgrelize extensions. */
  extensionOptions(groups: readonly OptionGroup[]): ExtensionOptions[] {
    return groups
      .flatMap((group) => group.types)
      .flatMap((name) => {
        const info = this.#own.get(name)!;
        const whole = EXTENSION_TEXT.test(this.#typeSummary(info));
        const names = this.#properties(info)
          .filter((property) => this.#isExtension(info, property))
          .map((property) => property.name);
        return whole || names.length > 0 ? [{ type: name, whole, names }] : [];
      });
  }

  /**
   * Options that the `sequelize@6` typings lack, are not marked as extensions in TSDoc and are not in the
   * allowlist of options that v6 accepts at runtime without declaring them. Forces a decision for new options.
   */
  unclassified(groups: readonly OptionGroup[], v6Runtime: readonly string[]): string[] {
    return groups
      .flatMap((group) => group.types)
      .flatMap((name) => {
        const info = this.#own.get(name)!;
        const v6Info = this.#v6.get(V6_NAMES[name] ?? name);
        if (v6Info === undefined) {
          return [];
        }
        const v6Props = new Set(this.#names(v6Info));
        return this.#properties(info)
          .filter(
            (property) =>
              !v6Props.has(property.name) &&
              !this.#isExtension(info, property) &&
              !v6Runtime.includes(property.name),
          )
          .map((property) => `${name}.${property.name}`);
      });
  }

  /** Top-level functions and constants of `src/index.ts` that `sequelize@6` does not export. */
  extensionValues(): ExtensionValue[] {
    return this.#ownValues
      .filter((entry) => !this.#v6Exports.has(entry.name))
      .map((entry) => ({ name: entry.name, summary: entry.summary }));
  }

  #describe(info: TypeInfo, property: ts.Symbol): string {
    const text = ts.displayPartsToString(property.getDocumentationComment(info.checker)).trim();
    const defaults = property
      .getJsDocTags()
      .filter((tag) => tag.name === 'defaultValue')
      .map((tag) => ts.displayPartsToString(tag.text).trim());
    const body = OptionReferenceBuilder.#inline(text);
    return defaults.length === 0 ? body : `${body} Default: ${defaults.join(', ')}.`.trim();
  }

  static #inline(text: string): string {
    const flat = text
      .replace(/\{@link\s+(?:[^|}]*\|\s*)?([^}]+)\}/g, '`$1`')
      .replace(/\s*\n\s*/g, ' ');
    return flat
      .split('`')
      .map((part, index) =>
        index % 2 === 1
          ? `\`${part.trim().replace(/\|/g, '\\|')}\``
          : part.replace(/\|/g, '\\|').replace(/</g, '&lt;').replace(/\{\{/g, '&#123;&#123;'),
      )
      .join('');
  }

  #typeText(info: TypeInfo, property: ts.Symbol): string {
    const declaration = property.valueDeclaration ?? property.declarations?.[0];
    const type =
      declaration === undefined
        ? info.checker.getTypeOfSymbol(property)
        : info.checker.getTypeOfSymbolAtLocation(property, declaration);
    const text = info.checker.typeToString(
      info.checker.getNonNullableType(type),
      undefined,
      ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope,
    );
    const short = text.length > 90 ? `${text.slice(0, 87)}…` : text;
    return `\`${short.replace(/\|/g, '\\|')}\``;
  }

  /** Markdown of one option type: heading, summary and a table of options with extension badges. */
  #renderType(name: string): string {
    const info = this.#own.get(name)!;
    const summary = OptionReferenceBuilder.#inline(this.#typeSummary(info));
    const badge = EXTENSION_TEXT.test(this.#typeSummary(info)) ? ' <Ext />' : '';
    const rows = this.#properties(info).map((property) => {
      const ext = this.#isExtension(info, property) ? ' <Ext />' : '';
      return `| \`${property.name}\`${ext} | ${this.#typeText(info, property)} | ${this.#describe(info, property)} |`;
    });
    return [
      `## ${name}${badge} {#${name.toLowerCase()}}`,
      '',
      summary,
      '',
      '| Option | Type | Description |',
      '| ------ | ---- | ----------- |',
      ...rows,
      '',
    ].join('\n');
  }

  #names(info: TypeInfo): string[] {
    return info.checker.getPropertiesOfType(info.type).map((property) => property.name);
  }

  /** The whole Markdown page for a group. */
  renderGroup(group: OptionGroup): string {
    const contents = group.types
      .map((name) => `- [\`${name}\`](#${name.toLowerCase()})`)
      .join('\n');
    return [
      `# ${group.title}`,
      '',
      group.lead,
      '',
      'Options marked <Ext /> exist only in postgrelize; Sequelize v6 has no such option. This page is generated from the TypeScript declarations and their TSDoc, so it always matches the code.',
      '',
      contents,
      '',
      ...group.types.map((name) => this.#renderType(name)),
    ].join('\n');
  }
}
