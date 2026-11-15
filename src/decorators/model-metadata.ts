import type { AssociationOptions, ThroughOptions } from '../associations/types.ts';
import type { IndexOptions } from '../ddl/ddl-generator.ts';
import type { HookType } from '../hooks/hooks.ts';
import type { AttributeOptions } from '../model/attribute-options.ts';
import type { AnyModel, InitOptions, ModelStatic } from '../model/options.ts';
import type { ScopeDefinition, ScopeOptions } from '../model/scope-registry.ts';
import type { DecoratorTarget } from './decorator-signature.ts';

/** Lazily resolved model class, so decorators can refer to classes defined later in the file. */
export type ModelGetter = () => ModelStatic<AnyModel>;

/** Table options of `@Table`: `Model.init` options without the `sequelize` instance. */
export type TableOptions = Omit<InitOptions, 'sequelize'>;

/** Named scopes given to `@Scopes`. */
export type ScopesInput = Readonly<Record<string, ScopeDefinition>>;

/** Association collected from `@HasOne`, `@HasMany`, `@BelongsTo` or `@BelongsToMany`. */
export type AssociationSpec = Readonly<{
  kind: 'hasOne' | 'hasMany' | 'belongsTo' | 'belongsToMany';
  key: string;
  target: ModelGetter;
  options: AssociationOptions;
  through?: string | ModelGetter | ThroughOptions;
}>;

/** Index collected from `@Index` on an attribute. */
export type IndexSpec = Readonly<{ key: string; options: IndexOptions }>;

/** Everything the decorators collected for one class. */
export type ModelMetadata = {
  table: TableOptions;
  defaultScope?: ScopeOptions | (() => ScopeOptions);
  scopes?: ScopesInput | (() => ScopesInput);
  columns: Record<string, Partial<AttributeOptions>>;
  timestamps: Partial<Record<'createdAt' | 'updatedAt' | 'deletedAt', string>>;
  foreignKeys: Record<string, ModelGetter>;
  indexes: IndexSpec[];
  associations: AssociationSpec[];
  hooks: { type: HookType; key: string }[];
};

const empty = (): ModelMetadata => ({
  table: {},
  columns: {},
  timestamps: {},
  foreignKeys: {},
  indexes: [],
  associations: [],
  hooks: [],
});

const symbolMetadata = (): symbol => (Symbol as unknown as { metadata: symbol }).metadata;

/**
 * Metadata that decorators collect, kept outside the decorated classes (no `reflect-metadata`).
 * Decorated classes are looked up by the class itself (legacy decorators) or by their TC39
 * `Symbol.metadata` bag; base classes contribute first.
 *
 * @internal
 */
export class MetadataStore {
  readonly #entries = new WeakMap<object, ModelMetadata>();

  /**
   * @param target - What the running decorator decorates.
   * @returns The metadata bag of its class, created on first use.
   */
  of(target: DecoratorTarget): ModelMetadata {
    const found = this.#entries.get(target.owner) ?? empty();
    this.#entries.set(target.owner, found);
    return found;
  }

  /**
   * @param model - Decorated class.
   * @returns Metadata of the class merged with its base classes' (derived classes win).
   */
  collect(model: object): ModelMetadata {
    const chain: object[] = [];
    for (let link: object | null = model; link !== null; link = Object.getPrototypeOf(link)) {
      chain.unshift(link);
    }
    return chain.flatMap((link) => this.#bags(link)).reduce(merge, empty());
  }

  #bags(link: object): ModelMetadata[] {
    const bag = Object.hasOwn(link, symbolMetadata())
      ? (link as Record<symbol, object>)[symbolMetadata()]
      : undefined;
    return [this.#entries.get(link), bag === undefined ? undefined : this.#entries.get(bag)].filter(
      (entry): entry is ModelMetadata => entry !== undefined,
    );
  }
}

const mergeColumns = (
  base: ModelMetadata['columns'],
  next: ModelMetadata['columns'],
): ModelMetadata['columns'] =>
  Object.fromEntries(
    [...Object.keys(base), ...Object.keys(next)].map((key) => [
      key,
      { ...base[key], ...next[key] },
    ]),
  );

const merge = (base: ModelMetadata, next: ModelMetadata): ModelMetadata => ({
  table: { ...base.table, ...next.table },
  defaultScope: next.defaultScope ?? base.defaultScope,
  scopes: next.scopes ?? base.scopes,
  columns: mergeColumns(base.columns, next.columns),
  timestamps: { ...base.timestamps, ...next.timestamps },
  foreignKeys: { ...base.foreignKeys, ...next.foreignKeys },
  indexes: [...base.indexes, ...next.indexes],
  associations: [...base.associations, ...next.associations],
  hooks: [...base.hooks, ...next.hooks],
});

/** @internal Shared metadata store of all decorators. */
export const metadata = new MetadataStore();
