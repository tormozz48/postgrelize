import type { ModelBase } from '../model-base.ts';

/**
 * Constructor of `ModelBase` or a class derived from it; the base type of model mixins.
 *
 * @internal
 */
// oxlint-disable-next-line typescript/no-explicit-any -- TypeScript requires `any[]` in mixin constructor types.
export type ModelConstructor = new (...args: any[]) => ModelBase;
