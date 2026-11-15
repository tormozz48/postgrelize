/**
 * Hook names accepted by `addHook` (Sequelize v6). Model lifecycle hooks, `beforeConnect` and the sync hooks
 * (`beforeBulkSync`, `afterBulkSync`, `beforeSync`, `afterSync`) run; the other connection / define hooks are accepted
 * and not run yet.
 */
export const HOOK_TYPES = [
  'beforeValidate',
  'afterValidate',
  'validationFailed',
  'beforeCreate',
  'afterCreate',
  'beforeUpdate',
  'afterUpdate',
  'beforeSave',
  'afterSave',
  'beforeDestroy',
  'afterDestroy',
  'beforeRestore',
  'afterRestore',
  'beforeUpsert',
  'afterUpsert',
  'beforeBulkCreate',
  'afterBulkCreate',
  'beforeBulkUpdate',
  'afterBulkUpdate',
  'beforeBulkDestroy',
  'afterBulkDestroy',
  'beforeBulkRestore',
  'afterBulkRestore',
  'beforeFind',
  'beforeFindAfterExpandIncludeAll',
  'beforeFindAfterOptions',
  'afterFind',
  'beforeCount',
  'beforeConnect',
  'afterConnect',
  'beforeDisconnect',
  'afterDisconnect',
  'beforePoolAcquire',
  'afterPoolAcquire',
  'beforeQuery',
  'afterQuery',
  'beforeSync',
  'afterSync',
  'beforeBulkSync',
  'afterBulkSync',
  'beforeDefine',
  'afterDefine',
  'beforeInit',
  'afterInit',
  'beforeAssociate',
  'afterAssociate',
] as const;

/** One of {@link HOOK_TYPES}. */
export type HookType = (typeof HOOK_TYPES)[number];

/** Hook function. May be async; its return value is ignored. Receives the model class as `this`. */
export type HookFunction = (...args: never[]) => unknown;

/** Registered hook: a function, optionally named so it can be removed by name. */
export type Hook = Readonly<{
  /** Hook name, used by `removeHook`. */
  name?: string;
  /** Hook function. */
  fn: HookFunction;
}>;

/** Hooks passed in `init({ hooks })` / `define({ hooks })`: one function or a list per hook type. */
export type HooksOption = Partial<
  Readonly<Record<HookType, HookFunction | readonly HookFunction[]>>
>;

const PROXIES: Partial<Readonly<Record<HookType, readonly HookType[]>>> = {
  beforeSave: ['beforeUpdate', 'beforeCreate', 'beforeSave'],
  afterSave: ['afterUpdate', 'afterCreate', 'afterSave'],
};

const HOOK_SET: ReadonlySet<string> = new Set(HOOK_TYPES);

/**
 * Immutable registry of hooks by type: `add` and `remove` return a new registry, so a model or `Sequelize`
 * instance replaces its registry on change.
 */
export class HookRegistry {
  /** Registry without hooks. */
  static readonly EMPTY: HookRegistry = new HookRegistry(new Map());

  readonly #hooks: ReadonlyMap<HookType, readonly Hook[]>;

  private constructor(hooks: ReadonlyMap<HookType, readonly Hook[]>) {
    this.#hooks = hooks;
  }

  /**
   * Builds a registry from the `hooks` option.
   *
   * @param option - One function or a list per hook type.
   * @param base - Registry the hooks are added to.
   * @returns Registry with the hooks of `base`, then those of `option`.
   */
  static fromOption(
    option: HooksOption | undefined,
    base: HookRegistry = HookRegistry.EMPTY,
  ): HookRegistry {
    return Object.entries(option ?? {}).reduce<HookRegistry>(
      (registry, [type, value]) =>
        (Array.isArray(value) ? value : [value]).reduce<HookRegistry>(
          (next, fn: HookFunction) => next.add(type, fn),
          registry,
        ),
      base,
    );
  }

  /**
   * Runs hooks of `type` from each registry in order (model hooks first, then Sequelize-level hooks).
   *
   * @param registries - Registries in run order.
   * @param type - Hook type.
   * @param context - `this` of the hook functions.
   * @param args - Hook arguments.
   * @returns Resolves when all hooks finished.
   */
  static async runAll(
    registries: readonly HookRegistry[],
    type: HookType,
    context: unknown,
    ...args: readonly unknown[]
  ): Promise<void> {
    const hooks = registries.flatMap((registry) => registry.#hooks.get(type) ?? []);
    await hooks.reduce<Promise<void>>(
      (previous, hook) =>
        previous.then(async () => {
          await (hook.fn as (...callArgs: unknown[]) => unknown).apply(context, [...args]);
        }),
      Promise.resolve(),
    );
  }

  /**
   * Returns a registry with `fn` added (to the proxied types for `beforeSave` / `afterSave`, like v6).
   *
   * @param type - Hook type.
   * @param fn - Hook function.
   * @param name - Name to remove the hook by.
   * @returns New registry.
   * @throws Error for an unknown hook type.
   */
  add(type: string, fn: HookFunction, name?: string): HookRegistry {
    const hook: Hook = name === undefined ? { fn } : { name, fn };
    const types = HookRegistry.#targets(type);
    return new HookRegistry(
      new Map([
        ...this.#hooks,
        ...types.map((target) => [target, [...(this.#hooks.get(target) ?? []), hook]] as const),
      ]),
    );
  }

  /**
   * Returns a registry without hooks matching `nameOrFn`.
   *
   * @param type - Hook type.
   * @param nameOrFn - Hook name or function; all hooks of the type when omitted.
   * @returns New registry.
   * @throws Error for an unknown hook type.
   */
  remove(type: string, nameOrFn?: string | HookFunction): HookRegistry {
    const types = HookRegistry.#targets(type);
    const keep = (hook: Hook): boolean =>
      nameOrFn !== undefined &&
      (typeof nameOrFn === 'string' ? hook.name !== nameOrFn : hook.fn !== nameOrFn);
    return new HookRegistry(
      new Map([
        ...this.#hooks,
        ...types.map((target) => [target, (this.#hooks.get(target) ?? []).filter(keep)] as const),
      ]),
    );
  }

  /**
   * Checks whether the registry has hooks of the type.
   *
   * @param type - Hook type.
   * @returns True when at least one hook exists.
   * @throws Error for an unknown hook type.
   */
  has(type: string): boolean {
    return (this.#hooks.get(HookRegistry.#assertHookType(type)) ?? []).length > 0;
  }

  /**
   * Like {@link HookRegistry.has}, but `undefined` for a type that never had a hook (what
   * Sequelize v6 `hasHook` returns).
   *
   * @param type - Hook type.
   * @returns Whether hooks exist, `undefined` when none was ever added.
   * @throws Error for an unknown hook type.
   */
  hasOrUndefined(type: string): boolean | undefined {
    const hooks = this.#hooks.get(HookRegistry.#assertHookType(type));
    return hooks === undefined ? undefined : hooks.length > 0;
  }

  /**
   * Runs the hooks of `type` in registration order.
   *
   * @param type - Hook type.
   * @param context - `this` of the hook functions.
   * @param args - Hook arguments.
   * @returns Resolves when all hooks finished.
   */
  run(type: HookType, context: unknown, ...args: readonly unknown[]): Promise<void> {
    return HookRegistry.runAll([this], type, context, ...args);
  }

  static #targets(type: string): readonly HookType[] {
    const hookType = HookRegistry.#assertHookType(type);
    return PROXIES[hookType] ?? [hookType];
  }

  static #assertHookType(type: string): HookType {
    if (!HOOK_SET.has(type)) {
      throw new Error(`${type} is not a valid hook type`);
    }
    return type as HookType;
  }
}
