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

type Loaded = Readonly<{ checker: ts.TypeChecker; exports: ReadonlyMap<string, ts.Symbol> }>;

/** The TSDoc modifier tag (registered in `tsdoc.json`) that marks an API item Sequelize v6 does not have. */
const EXTENSION_TAG = 'postgrelize';

/** Classes whose `@postgrelize` members are listed on the Extensions page. */
const EXTENSION_CLASSES: readonly string[] = [
  'Model',
  'Sequelize',
  'Transaction',
  'QueryInterface',
];

const tagText = (tag: ts.JSDocTagInfo): string => ts.displayPartsToString(tag.text).trim();

const hasExtensionTag = (symbol: ts.Symbol): boolean =>
  symbol.getJsDocTags().some((tag) => tag.name === EXTENSION_TAG);

/** Options of one type that Sequelize v6 lacks; `whole` when the entire type is new. */
export type ExtensionOptions = Readonly<{ type: string; whole: boolean; names: readonly string[] }>;

/** A method, function or constant tagged `@postgrelize`, with the first sentence of its TSDoc. */
export type ExtensionItem = Readonly<{ name: string; summary: string; api: string }>;

/**
 * Reads option types and `@postgrelize` items from the postgrelize declarations (and the `sequelize@6`
 * typings for comparison) and renders the option reference tables.
 */
export class OptionReferenceBuilder {
  readonly #ownProgram: Loaded;
  readonly #own: Map<string, TypeInfo>;
  readonly #v6: Map<string, TypeInfo>;
  readonly #v6Program: Loaded;

  constructor(root: string = process.cwd()) {
    const config = ts.readConfigFile(`${root}/tsconfig.build.json`, ts.sys.readFile);
    const options = {
      ...ts.parseJsonConfigFileContent(config.config, ts.sys, root).options,
      noEmit: true,
    };
    this.#ownProgram = OptionReferenceBuilder.#load(`${root}/src/index.ts`, options);
    this.#own = OptionReferenceBuilder.#types(this.#ownProgram);
    this.#v6Program = OptionReferenceBuilder.#load(
      `${root}/node_modules/sequelize/types/index.d.ts`,
      options,
    );
    this.#v6 = OptionReferenceBuilder.#types(this.#v6Program);
  }

  static #load(entry: string, options: ts.CompilerOptions): Loaded {
    const program = ts.createProgram([entry], options);
    const checker = program.getTypeChecker();
    const source = program.getSourceFile(entry);
    const module = source === undefined ? undefined : checker.getSymbolAtLocation(source);
    const exports = new Map<string, ts.Symbol>();
    for (const exported of module === undefined ? [] : checker.getExportsOfModule(module)) {
      exports.set(
        exported.name,
        (exported.flags & ts.SymbolFlags.Alias) === 0
          ? exported
          : checker.getAliasedSymbol(exported),
      );
    }
    return { checker, exports };
  }

  static #types({ checker, exports }: Loaded): Map<string, TypeInfo> {
    const result = new Map<string, TypeInfo>();
    for (const [name, symbol] of exports) {
      if ((symbol.flags & (ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias)) !== 0) {
        result.set(name, { checker, symbol, type: checker.getDeclaredTypeOfSymbol(symbol) });
      }
    }
    return result;
  }

  #summary(symbol: ts.Symbol): string {
    const text = ts.displayPartsToString(symbol.getDocumentationComment(this.#ownProgram.checker));
    return OptionReferenceBuilder.#inline(
      /^.*?[^.](?<!\be\.g|\bi\.e)[.!?](?=\s+[A-Z]|$)/s.exec(text.trim())?.[0] ?? text.trim(),
    );
  }

  /** Members of `Model`, `Sequelize`, `Transaction` and `QueryInterface` tagged `@postgrelize`. */
  extensionMembers(): ExtensionItem[] {
    return EXTENSION_CLASSES.flatMap((name) => {
      const members = OptionReferenceBuilder.#members(this.#ownProgram, name);
      return members.filter(hasExtensionTag).map((member) => ({
        name: `${name}.${member.name}`,
        summary: this.#summary(member),
        api: `/api/classes/${name}#${member.name.toLowerCase()}`,
      }));
    });
  }

  static #members({ checker, exports }: Loaded, name: string): ts.Symbol[] {
    const symbol = exports.get(name);
    return symbol === undefined
      ? []
      : [
          ...checker.getPropertiesOfType(checker.getTypeOfSymbol(symbol)),
          ...checker.getPropertiesOfType(checker.getDeclaredTypeOfSymbol(symbol)),
        ];
  }

  /**
   * Documented public members of `Model`, `Sequelize`, `Transaction` and `QueryInterface` that the
   * `sequelize@6` typings lack and that are neither tagged `@postgrelize` nor allowlisted as v6 runtime
   * members. Static aliases (capitalised names such as `Sequelize.STRING`) are v6 statics and skipped.
   */
  unclassifiedMembers(v6Runtime: readonly string[]): string[] {
    const { checker } = this.#ownProgram;
    return EXTENSION_CLASSES.flatMap((name) => {
      const v6 = new Set(OptionReferenceBuilder.#members(this.#v6Program, name).map((m) => m.name));
      return OptionReferenceBuilder.#members(this.#ownProgram, name)
        .filter(
          (member) =>
            !v6.has(member.name) &&
            /^[a-z]/.test(member.name) &&
            !hasExtensionTag(member) &&
            !member.getJsDocTags().some((tag) => tag.name === 'internal') &&
            ts.displayPartsToString(member.getDocumentationComment(checker)).trim() !== '' &&
            !v6Runtime.includes(`${name}.${member.name}`),
        )
        .map((member) => `${name}.${member.name}`);
    });
  }

  /** TypeDoc files `const f = () => ...` exports under `functions/`, like function declarations. */
  #isCallable(symbol: ts.Symbol): boolean {
    const { checker } = this.#ownProgram;
    return checker.getTypeOfSymbol(symbol).getCallSignatures().length > 0;
  }

  /** Top-level functions and constants of `src/index.ts` tagged `@postgrelize`. */
  extensionValues(): ExtensionItem[] {
    return [...this.#ownProgram.exports]
      .filter(
        ([, symbol]) =>
          (symbol.flags & (ts.SymbolFlags.Variable | ts.SymbolFlags.Function)) !== 0 &&
          hasExtensionTag(symbol),
      )
      .map(([name, symbol]) => ({
        name,
        summary: this.#summary(symbol),
        api: `/api/${this.#isCallable(symbol) ? 'functions' : 'variables'}/${name}`,
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

  /** Options (and whole option types) tagged `@postgrelize`. */
  extensionOptions(groups: readonly OptionGroup[]): ExtensionOptions[] {
    return groups
      .flatMap((group) => group.types)
      .flatMap((name) => {
        const info = this.#own.get(name)!;
        const whole = hasExtensionTag(info.symbol);
        const names = this.#properties(info)
          .filter((property) => hasExtensionTag(property))
          .map((property) => property.name);
        return whole || names.length > 0 ? [{ type: name, whole, names }] : [];
      });
  }

  /**
   * Options that the `sequelize@6` typings lack, are not tagged `@postgrelize` and are not in the
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
              !hasExtensionTag(property) &&
              !v6Runtime.includes(property.name),
          )
          .map((property) => `${name}.${property.name}`);
      });
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
    const badge = hasExtensionTag(info.symbol) ? ' <Ext />' : '';
    const rows = this.#properties(info).map((property) => {
      const ext = hasExtensionTag(property) ? ' <Ext />' : '';
      return `| \`${property.name}\`${ext} | ${this.#typeText(info, property)} | ${this.#describe(info, property)} |`;
    });
    return [
      `## ${name}${badge} {#${name.toLowerCase()}}`,
      '',
      summary,
      '',
      ...this.#typeTags(info),
      '| Option | Type | Description |',
      '| ------ | ---- | ----------- |',
      ...rows,
      '',
    ].join('\n');
  }

  /** `@see` links and `@example` blocks of the type's own TSDoc, as Markdown. */
  #typeTags(info: TypeInfo): string[] {
    const tags = info.symbol.getJsDocTags(info.checker);
    const see = tags
      .filter((tag) => tag.name === 'see')
      .map((tag) => OptionReferenceBuilder.#inline(tagText(tag)));
    const examples = tags.filter((tag) => tag.name === 'example').map(tagText);
    return [
      ...(see.length === 0 ? [] : [`See also: ${see.join(', ')}.`, '']),
      ...examples.flatMap((example) => [example, '']),
    ];
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
