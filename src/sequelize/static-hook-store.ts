import { HookRegistry } from '../hooks/hooks.ts';

/** Static hooks of the `Sequelize` class (`Sequelize.addHook`), shared by all instances created afterwards. @internal */
export const staticHooks: { registry: HookRegistry } = { registry: HookRegistry.EMPTY };
