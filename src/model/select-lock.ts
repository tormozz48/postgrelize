import type { LockNode } from '../sql/ast.ts';
import { LOCK } from '../transaction/transaction.ts';
import type { LockOption, SelectOptions } from './select-options.ts';

const LOCK_STRENGTHS: ReadonlySet<string> = new Set(Object.values(LOCK));

// Sequelize v6 emits FOR UPDATE for any lock level it does not know.
const lockStrength = (level: unknown): LockNode['strength'] =>
  typeof level === 'string' && LOCK_STRENGTHS.has(level)
    ? (level as LockNode['strength'])
    : LOCK.UPDATE;

type LockTables = Extract<LockOption, object>['of'];

// An empty OF list would silently lock every table, so it is refused.
const lockTables = (of: LockTables): Pick<LockNode, 'of'> => {
  if (of === undefined || of === null) {
    return {};
  }
  const names = [of].flat().map((table) => (typeof table === 'string' ? table : table.name));
  if (names.length === 0 || names.some((name) => typeof name !== 'string' || name === '')) {
    throw new Error('lock.of must name at least one model or table alias');
  }
  return { of: names };
};

const lockOf = (options: SelectOptions): LockNode | undefined => {
  if (options.lock === undefined || options.lock === false) {
    return undefined;
  }
  if (options.skipLocked === true && options.noWait === true) {
    throw new Error('skipLocked and noWait cannot be used together');
  }
  const wait =
    options.skipLocked === true ? 'SKIP LOCKED' : options.noWait === true ? 'NOWAIT' : undefined;
  const base: LockNode =
    options.lock === true
      ? { strength: 'UPDATE' }
      : typeof options.lock === 'string'
        ? { strength: lockStrength(options.lock) }
        : {
            strength: lockStrength(options.lock.level),
            ...lockTables(options.lock.of),
          };
  return wait === undefined ? base : { ...base, wait };
};

/** Resolves the `lock`, `skipLocked` and `noWait` options into a row-lock clause. */
export class SelectLock {
  /**
   * Row-lock clause of the options.
   *
   * @param options - Select options.
   * @returns Lock node, or `undefined` without a lock.
   * @throws Error when `skipLocked` and `noWait` are both set, or `lock.of` names no table.
   */
  of(options: SelectOptions): LockNode | undefined {
    return lockOf(options);
  }
}
