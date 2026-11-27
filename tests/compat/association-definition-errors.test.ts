import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

const outcome = (run: () => unknown): string => {
  try {
    run();
    return 'defined';
  } catch (error) {
    return (error as Error).message;
  }
};

describe('compat: errors while an association is defined', () => {
  it('rejects invalid targets and unknown source and target keys', () =>
    expectSameResult('', async (_lib, sequelize) => {
      type Loose = Record<string, (...args: unknown[]) => unknown>;
      const User = sequelize.define('user', {}) as unknown as Loose;
      const Task = sequelize.define('task', {}) as unknown as Loose;
      const methods = ['belongsTo', 'hasOne', 'hasMany', 'belongsToMany'];
      return [
        ...methods.flatMap((method) => [
          outcome(() => User[method]!()),
          outcome(() => User[method]!({}, { through: 'x' })),
        ]),
        outcome(() => User['hasOne']!(Task, { sourceKey: 'wow' })),
        outcome(() => Task['belongsTo']!(User, { targetKey: 'wow' })),
      ];
    }));
});
