/** Model lifecycle hook names (Sequelize v6). */
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
] as const;

/** One of {@link HOOK_TYPES}. */
export type HookType = (typeof HOOK_TYPES)[number];

/** Hook function. May be async; its return value is ignored. Receives the model class as `this`. */
export type HookFunction = (...args: never[]) => unknown;

/** Registered hook: a function, optionally named so it can be removed by name. */
export type Hook = Readonly<{ name?: string; fn: HookFunction }>;

/** Immutable hook registry. */
export type HookRegistry = ReadonlyMap<HookType, readonly Hook[]>;

/** Hooks passed in `init({ hooks })` / `define({ hooks })`: one function or a list per hook type. */
export type HooksOption = Partial<
  Readonly<Record<HookType, HookFunction | readonly HookFunction[]>>
>;

const PROXIES: Partial<Readonly<Record<HookType, readonly HookType[]>>> = {
  beforeSave: ['beforeUpdate', 'beforeCreate', 'beforeSave'],
  afterSave: ['afterUpdate', 'afterCreate', 'afterSave'],
};

const HOOK_SET: ReadonlySet<string> = new Set(HOOK_TYPES);

/** @internal */
export const isHookType = (value: string): value is HookType => HOOK_SET.has(value);

const assertHookType = (type: string): HookType => {
  if (!isHookType(type)) {
    throw new Error(`${type} is not a valid hook type`);
  }
  return type;
};

/** Empty registry. */
export const emptyHooks: HookRegistry = new Map();

/** Returns a registry with `fn` added (to proxied types for `beforeSave` / `afterSave`, like v6). */
export const addHook = (
  registry: HookRegistry,
  type: string,
  fn: HookFunction,
  name?: string,
): HookRegistry => {
  const hook: Hook = name === undefined ? { fn } : { name, fn };
  const types = PROXIES[assertHookType(type)] ?? [assertHookType(type)];
  return new Map([
    ...registry,
    ...types.map((target) => [target, [...(registry.get(target) ?? []), hook]] as const),
  ]);
};

/** Returns a registry without hooks matching `nameOrFn` (all hooks of the type when omitted). */
export const removeHook = (
  registry: HookRegistry,
  type: string,
  nameOrFn?: string | HookFunction,
): HookRegistry => {
  const types = PROXIES[assertHookType(type)] ?? [assertHookType(type)];
  const keep = (hook: Hook): boolean =>
    nameOrFn !== undefined &&
    (typeof nameOrFn === 'string' ? hook.name !== nameOrFn : hook.fn !== nameOrFn);
  return new Map([
    ...registry,
    ...types.map((target) => [target, (registry.get(target) ?? []).filter(keep)] as const),
  ]);
};

/** True when the registry has hooks of the type. */
export const hasHook = (registry: HookRegistry, type: string): boolean =>
  (registry.get(assertHookType(type)) ?? []).length > 0;

/** Builds a registry from the `hooks` option. */
export const hooksFromOption = (
  option: HooksOption | undefined,
  base: HookRegistry = emptyHooks,
): HookRegistry =>
  Object.entries(option ?? {}).reduce<HookRegistry>(
    (registry, [type, value]) =>
      (Array.isArray(value) ? value : [value]).reduce<HookRegistry>(
        (next, fn: HookFunction) => addHook(next, type, fn),
        registry,
      ),
    base,
  );

/** Runs hooks of `type` from each registry in order (model hooks first, then Sequelize-level hooks). */
export const runHooks = async (
  registries: readonly HookRegistry[],
  type: HookType,
  context: unknown,
  ...args: readonly unknown[]
): Promise<void> => {
  const hooks = registries.flatMap((registry) => registry.get(type) ?? []);
  await hooks.reduce<Promise<void>>(
    (previous, hook) =>
      previous.then(async () => {
        await (hook.fn as (...callArgs: unknown[]) => unknown).apply(context, [...args]);
      }),
    Promise.resolve(),
  );
};
