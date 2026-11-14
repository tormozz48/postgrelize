import { isExpression } from '../expressions/methods.ts';
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

/** Scopes of a model. */
export type ScopeRegistry = Readonly<{
  defaultScope: ScopeOptions;
  scopes: ReadonlyMap<string, ScopeDefinition>;
  whereMergeStrategy: WhereMergeStrategy;
}>;

const isPlainObject = (value: unknown): value is Readonly<Record<string | symbol, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && !isExpression(value);

const union = (left: readonly unknown[], right: readonly unknown[]): readonly unknown[] => [
  ...left,
  ...right.filter((item) => !left.includes(item)),
];

const asCondition = (value: unknown): unknown =>
  isExpression(value) ? { [Op.and]: value } : value;

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
 * Merges find options like Sequelize v6 `_assignOptions`: `where` / `having` keys of `right`
 * overwrite `left` (or are AND-ed with `whereMergeStrategy: 'and'`), arrays are unioned, other
 * keys of `right` win.
 */
export const mergeOptions = (
  left: ScopeOptions,
  right: ScopeOptions,
  strategy: WhereMergeStrategy = 'overwrite',
): ScopeOptions =>
  Object.fromEntries(
    [...new Set([...Object.keys(left), ...Object.keys(right)])].map((key) => [
      key,
      mergeValue(key, left[key], right[key], strategy),
    ]),
  );

const resolveOne = (registry: ScopeRegistry, selector: ScopeSelector): ScopeOptions => {
  if (selector === null) {
    return {};
  }
  if (typeof selector === 'string') {
    if (selector === 'defaultScope') {
      return registry.defaultScope;
    }
    const scope = registry.scopes.get(selector);
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
  if ('method' in selector) {
    const method: readonly unknown[] = Array.isArray(selector.method)
      ? selector.method
      : [selector.method];
    const [name = '', ...args] = method as readonly string[];
    const scope = registry.scopes.get(name);
    if (typeof scope !== 'function') {
      throw new Error(`Invalid scope ${name} called.`);
    }
    return (scope as (...scopeArgs: unknown[]) => ScopeOptions)(...args);
  }
  return selector;
};

/** Resolves and merges the selected scopes in order (later scopes win). */
export const resolveScopes = (
  registry: ScopeRegistry,
  selectors: readonly ScopeSelector[],
): ScopeOptions =>
  selectors
    .map((selector) => resolveOne(registry, selector))
    .reduce<ScopeOptions>(
      (merged, scope) => mergeOptions(merged, scope, registry.whereMergeStrategy),
      {},
    );

/** Applies a resolved scope to query options; the query options win (Sequelize v6 `_injectScope`). */
export const injectScope = <T extends ScopeOptions>(
  scope: ScopeOptions,
  options: T,
  strategy: WhereMergeStrategy,
): T => mergeOptions(scope, options, strategy) as T;

/** Builds the scope registry from model options. */
export const scopeRegistry = (
  defaultScope: ScopeOptions | undefined,
  scopes: Readonly<Record<string, ScopeDefinition>> | undefined,
  whereMergeStrategy: WhereMergeStrategy | undefined,
): ScopeRegistry => ({
  defaultScope: defaultScope ?? {},
  scopes: new Map(Object.entries(scopes ?? {})),
  whereMergeStrategy: whereMergeStrategy ?? 'overwrite',
});
