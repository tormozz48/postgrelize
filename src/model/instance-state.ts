import type { IncludeNode } from '../associations/include.ts';

const UNCHANGED: ReadonlySet<string> = new Set();
const NO_INCLUDES: readonly IncludeNode[] = [];

/**
 * Internal state of one model instance: changed attribute names, the include tree it was built
 * with, and the write metadata exposed as `wasInserted` / `oldValues`. Reached through
 * `instance[InstanceState.key]()`.
 */
export class InstanceState {
  /** Key of the instance method returning its state. */
  static readonly key: unique symbol = Symbol('postgrelize.instanceState');

  /** Changed attribute names (replaced, never mutated). */
  changed: ReadonlySet<string> = UNCHANGED;
  /** Include tree of a nested build. */
  includes: readonly IncludeNode[] = NO_INCLUDES;
  /** Whether the row was inserted (`true`) or updated (`false`) by an `ON CONFLICT` write. */
  wasInserted: boolean | undefined = undefined;
  /** Pre-statement values from `returningOld`, `null` for inserted rows. */
  oldValues: Readonly<Record<string, unknown>> | null | undefined = undefined;

  /**
   * Marks an attribute as changed or unchanged.
   *
   * @param name - Attribute name.
   * @param changed - Changed flag.
   */
  mark(name: string, changed: boolean): void {
    this.changed = changed
      ? new Set([...this.changed, name])
      : new Set([...this.changed].filter((item) => item !== name));
  }

  /** Forgets all changes (after a load or save). */
  reset(): void {
    this.changed = UNCHANGED;
  }
}
