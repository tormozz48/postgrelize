type Include = Readonly<Record<string, unknown>>;
type Merge = (left: Include, right: Include) => Include;

/**
 * Includes of merged scopes and query options (Sequelize v6 `_uniqIncludes`): concatenated, and
 * entries of the same model and alias become one, merged like the options themselves.
 *
 * @internal
 */
export class ScopeIncludes {
  merge(left: unknown, right: unknown, merge: Merge): readonly unknown[] {
    const grouped = new Map<unknown, unknown>();
    for (const item of [...this.#list(left), ...this.#list(right)]) {
      const include = this.#conform(item);
      const key = this.#key(include);
      const previous = grouped.get(key) as Include | undefined;
      grouped.set(key, previous === undefined ? include : merge(previous, include as Include));
    }
    return [...grouped.values()];
  }

  #list(include: unknown): readonly unknown[] {
    return include === undefined ? [] : Array.isArray(include) ? include : [include];
  }

  // a model class or association object in its options form; anything else is left to validation
  #conform(item: unknown): unknown {
    if (typeof item === 'function') {
      return { model: item };
    }
    if (typeof item !== 'object' || item === null) {
      return item;
    }
    if ('associationType' in item) {
      const { target, as } = item as Include;
      return { model: target, as, association: item };
    }
    return item;
  }

  // entries that name no model, alias or association (`{ all: true }`, invalid ones) stay apart
  #key(include: unknown): unknown {
    const { model, as, association } = (include ?? {}) as Include;
    const name = (model as Readonly<{ name?: string }> | undefined)?.name;
    const alias = as ?? (typeof association === 'string' ? association : undefined);
    return name === undefined && alias === undefined ? include : `${name}-${String(alias)}`;
  }
}
