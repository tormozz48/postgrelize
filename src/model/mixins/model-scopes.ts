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
     * Returns a model class using the given scopes instead of the default scope.
     *
     * @param selectors - Scope names, `{ method: [name, ...args] }`, inline options, `'defaultScope'`, or `null`.
     * @returns Scoped model class (instances are instances of this model).
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
     * Returns a model class without any scope (not even the default scope).
     *
     * @returns Unscoped model class.
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
