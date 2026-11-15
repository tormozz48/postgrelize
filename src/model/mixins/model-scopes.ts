import { registry } from '../model-services.ts';
import type { Model } from '../model.ts';
import type { AnyModel, ModelStatic } from '../options.ts';
import type { ScopeDefinition, ScopeSelector } from '../scope-registry.ts';
import type { ModelConstructor } from './model-constructor.ts';

/**
 * Scope statics of `Model`: `scope`, `unscoped`, `addScope`.
 *
 * @internal
 */
// oxlint-disable-next-line max-lines-per-function, typescript/explicit-module-boundary-types -- a mixin factory's body is its class (each method is still size-checked); its type can only be inferred.
export const ModelScopes = <TBase extends ModelConstructor>(Base: TBase) => {
  return class ScopesCapability extends Base {
    /**
     * Creates a model class that applies the given scopes to its queries instead of the default
     * scope. The original class is not changed.
     *
     * @param this - The model class.
     * @param selectors - Scope names, `{ method: [name, ...args] }`, inline options, `'defaultScope'`, or `null`.
     * @returns Scoped model class (instances are instances of this model).
     * @throws Error when a named scope does not exist.
     * @example
     * ```ts
     * await User.scope('active', { method: ['olderThan', 18] }).findAll();
     * ```
     * @see [Querying guide](/guide/querying)
     */
    static scope<MS extends ModelStatic<AnyModel>>(
      this: MS,
      ...selectors: readonly (ScopeSelector | readonly ScopeSelector[])[]
    ): MS {
      const Scoped = { [this.name]: class extends (this as unknown as typeof Model) {} }[
        this.name
      ] as unknown as MS;
      const flat = selectors.flatMap((selector) =>
        Array.isArray(selector) ? selector : [selector],
      ) as readonly ScopeSelector[];
      registry.selectScopes(this, Scoped, flat);
      return Scoped;
    }

    /**
     * Creates a model class that applies no scope at all, not even the default scope.
     *
     * @param this - The model class.
     * @returns Unscoped model class.
     * @example
     * ```ts
     * const everyone = await User.unscoped().findAll();
     * ```
     */
    static unscoped<MS extends ModelStatic<AnyModel>>(this: MS): MS {
      return this.scope();
    }

    /**
     * Adds a named scope (or replaces the default scope with name `'defaultScope'`).
     *
     * @param name - Scope name.
     * @param scope - Options or a function returning options.
     * @param options - `override: true` replaces an existing scope.
     * @throws Error when the scope exists and `override` is not set.
     * @example
     * ```ts
     * User.addScope('active', { where: { active: true } });
     * User.addScope('olderThan', (age: number) => ({ where: { age: { [Op.gt]: age } } }));
     * ```
     */
    static addScope(
      name: string,
      scope: ScopeDefinition,
      options: Readonly<{ override?: boolean }> = {},
    ): void {
      registry.addScope(this, name, scope, options.override === true);
    }
  };
};
