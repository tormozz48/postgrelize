import { SqlExpression } from '../expressions/methods.ts';
import { Op } from '../expressions/op.ts';

/** Find options stored in a scope (`where`, `attributes`, `order`, `limit`, ...). */
export type ScopeOptions = Readonly<Record<string, unknown>>;

/** Scope definition: options, or a function of arguments returning options. */
export type ScopeDefinition = ScopeOptions | ((...args: never[]) => ScopeOptions);

/** Scope selector for `Model.scope()`: a name, `{ method: [name, ...args] }`, or inline options. */
export type ScopeSelector = string | ScopeMethodSelector | ScopeOptions | null;

/** `{ method: [name, ...args] }` — calls a function scope with arguments. */
export type ScopeMethodSelector = Readonly<{
  /** Scope function name, or `[name, ...args]`. */
  method: string | readonly [string, ...unknown[]];
}>;

/** `whereMergeStrategy` model option: overwrite same keys (v6 default) or combine with `Op.and`. */
export type WhereMergeStrategy = 'overwrite' | 'and';

const isPlainObject = (value: unknown): value is Readonly<Record<string | symbol, unknown>> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof SqlExpression);

const union = (left: readonly unknown[], right: readonly unknown[]): readonly unknown[] => [
  ...left,
  ...right.filter((item) => !left.includes(item)),
];

const asCondition = (value: unknown): unknown =>
  value instanceof SqlExpression ? { [Op.and]: value } : value;

const mergeWhere = (left: unknown, right: unknown, strategy: WhereMergeStrategy): unknown => {
  if (left === undefined) {
    return right;
  }
  if (right === undefined) {
    return left;
  }
  if (strategy === 'and') {
    return { [Op.and]: [left, right] };
  }
  const source = asCondition(right);
  return isPlainObject(left) && isPlainObject(source) ? { ...left, ...source } : source;
};

const mergeAttributes = (left: unknown, right: unknown): unknown =>
  isPlainObject(left) && isPlainObject(right)
    ? Object.fromEntries(
        [...new Set([...Object.keys(left), ...Object.keys(right)])].map((key) => {
          const a = left[key];
          const b = right[key];
          return [key, Array.isArray(a) && Array.isArray(b) ? union(a, b) : (b ?? a)];
        }),
      )
    : (right ?? left);

const mergeValue = (
  key: string,
  left: unknown,
  right: unknown,
  strategy: WhereMergeStrategy,
): unknown => {
  if (key === 'where' || key === 'having') {
    return mergeWhere(left, right, strategy);
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    return union(left, right);
  }
  if (key === 'attributes') {
    return mergeAttributes(left, right);
  }
  return right === undefined ? left : right;
};

/**
 * Scopes of a model (default scope, named scopes, `whereMergeStrategy`) and the Sequelize v6
 * option merging rules used to apply them. Immutable: {@link ScopeRegistry.with} returns a new registry.
 */
export class ScopeRegistry {
  /** Default scope (`{}` when none). */
  readonly defaultScope: ScopeOptions;
  /** Named scopes. */
  readonly scopes: ReadonlyMap<string, ScopeDefinition>;
  /** How `where` / `having` of merged options combine. */
  readonly whereMergeStrategy: WhereMergeStrategy;

  /**
   * @param defaultScope - Default scope of the model.
   * @param scopes - Named scopes.
   * @param whereMergeStrategy - `'overwrite'` (default) or `'and'`.
   */
  constructor(
    defaultScope: ScopeOptions | undefined,
    scopes:
      | Readonly<Record<string, ScopeDefinition>>
      | ReadonlyMap<string, ScopeDefinition>
      | undefined,
    whereMergeStrategy: WhereMergeStrategy | undefined,
  ) {
    this.defaultScope = defaultScope ?? {};
    this.scopes = scopes instanceof Map ? scopes : new Map(Object.entries(scopes ?? {}));
    this.whereMergeStrategy = whereMergeStrategy ?? 'overwrite';
  }

  /**
   * Merges find options like Sequelize v6 `_assignOptions`: `where` / `having` keys of `right`
   * overwrite `left` (or are AND-ed with `whereMergeStrategy: 'and'`), arrays are unioned, other
   * keys of `right` win.
   *
   * @param left - Base options.
   * @param right - Options applied on top.
   * @returns Merged options.
   */
  merge(left: ScopeOptions, right: ScopeOptions): ScopeOptions {
    const strategy = this.whereMergeStrategy;
    return Object.fromEntries(
      [...new Set([...Object.keys(left), ...Object.keys(right)])].map((key) => [
        key,
        mergeValue(key, left[key], right[key], strategy),
      ]),
    );
  }

  /**
   * Resolves and merges the selected scopes in order (later scopes win).
   *
   * @param selectors - Scope names, `{ method: [name, ...args] }`, inline options or `null`.
   * @returns Merged scope options.
   * @throws Error for unknown scopes.
   */
  resolve(selectors: readonly ScopeSelector[]): ScopeOptions {
    return selectors
      .map((selector) => this.#resolveOne(selector))
      .reduce<ScopeOptions>((merged, scope) => this.merge(merged, scope), {});
  }

  /**
   * Applies a resolved scope to query options; the query options win (Sequelize v6 `_injectScope`).
   *
   * @param scope - Resolved scope.
   * @param options - Query options.
   * @returns Merged options.
   */
  inject<T extends ScopeOptions>(scope: ScopeOptions, options: T): T {
    return this.merge(scope, options) as T;
  }

  /**
   * Whether a scope with this name exists (`'defaultScope'`: whether it is not empty).
   *
   * @param name - Scope name.
   * @returns True when defined.
   */
  has(name: string): boolean {
    return name === 'defaultScope'
      ? Object.keys(this.defaultScope).length > 0
      : this.scopes.has(name);
  }

  /**
   * Registry with a scope added or replaced (`'defaultScope'` replaces the default scope).
   *
   * @param name - Scope name.
   * @param scope - Options or a function returning options.
   * @returns New registry.
   */
  with(name: string, scope: ScopeDefinition): ScopeRegistry {
    return name === 'defaultScope'
      ? new ScopeRegistry(scope as ScopeOptions, this.scopes, this.whereMergeStrategy)
      : new ScopeRegistry(
          this.defaultScope,
          new Map([...this.scopes, [name, scope]]),
          this.whereMergeStrategy,
        );
  }

  #resolveOne(selector: ScopeSelector): ScopeOptions {
    if (selector === null) {
      return {};
    }
    if (typeof selector === 'string') {
      return this.#resolveNamed(selector);
    }
    if ('method' in selector) {
      return this.#resolveMethod(selector as ScopeMethodSelector);
    }
    return selector;
  }

  #resolveNamed(selector: string): ScopeOptions {
    if (selector === 'defaultScope') {
      return this.defaultScope;
    }
    const scope = this.scopes.get(selector);
    if (scope === undefined) {
      throw new Error(`Invalid scope ${selector} called.`);
    }
    if (typeof scope === 'function') {
      throw new Error(
        `Scope "${selector}" is a function; use { method: ['${selector}', ...args] }`,
      );
    }
    return scope;
  }

  #resolveMethod(selector: ScopeMethodSelector): ScopeOptions {
    const method: readonly unknown[] = Array.isArray(selector.method)
      ? selector.method
      : [selector.method];
    const [name = '', ...args] = method as readonly string[];
    const scope = this.scopes.get(name);
    if (typeof scope !== 'function') {
      throw new Error(`Invalid scope ${name} called.`);
    }
    return (scope as (...scopeArgs: unknown[]) => ScopeOptions)(...args);
  }
}
