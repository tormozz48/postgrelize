import type { IncludeNode } from '../associations/include.ts';

const UNCHANGED: ReadonlySet<string> = new Set();
const NO_INCLUDES: readonly IncludeNode[] = [];
// A symbol-keyed own property: invisible to attribute enumeration, JSON and the instance type.
const STATE = Symbol('postgrelize.instanceState');

/**
 * Internal state of one model instance: changed attribute names, the include tree it was built
 * with, and the write metadata exposed as `wasInserted` / `oldValues`. Stored under a private symbol
 * (no attribute-like member, no private field that would break mixin declaration types).
 */
export class InstanceState {
  /**
   * Creates the state of a new instance.
   *
   * @param instance - Model instance.
   */
  static attach(instance: object): void {
    (instance as Record<symbol, InstanceState>)[STATE] = new InstanceState();
  }

  /**
   * State of an instance.
   *
   * @param instance - Model instance.
   * @returns Its state.
   */
  static of(instance: object): InstanceState {
    return (instance as Record<symbol, InstanceState>)[STATE] as InstanceState;
  }

  /**
   * Whether a value is a model instance (has a state).
   *
   * @param value - Any value.
   * @returns True for model instances.
   */
  static has(value: unknown): boolean {
    return typeof value === 'object' && value !== null && STATE in value;
  }

  /**
   * Changed attribute names. The set belongs to this instance and grows in place; readers copy it
   * (`[...changed]`) when they need a snapshot.
   */
  changed: ReadonlySet<string> = UNCHANGED;
  /** Include tree of a nested build. */
  includes: readonly IncludeNode[] = NO_INCLUDES;
  /** Include tree the instance was loaded with by a finder; `reload()` loads it again (v6 `_options.include`). */
  loadedIncludes: readonly IncludeNode[] = NO_INCLUDES;
  /** Built from a query row; like v6, such instances do not list the virtual `getterMethods`. */
  queried = false;
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
    if (!changed) {
      (this.changed as Set<string>).delete(name);
    } else if (this.changed === UNCHANGED) {
      this.changed = new Set([name]);
    } else {
      (this.changed as Set<string>).add(name);
    }
  }

  /** Forgets all changes (after a load or save). */
  reset(): void {
    this.changed = UNCHANGED;
  }
}
