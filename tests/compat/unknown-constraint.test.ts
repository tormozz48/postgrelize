import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: removing an unknown constraint', () => {
  it('rejects with UnknownConstraintError', () =>
    expectSameResult('CREATE TABLE users (id int)', async (_lib, sequelize) => {
      try {
        await sequelize.getQueryInterface().removeConstraint('users', 'users_nope_key');
        return 'removed';
      } catch (error) {
        const { name, message, constraint, table, sql } = error as Record<string, unknown> & Error;
        return [name, message, constraint, table, typeof sql];
      }
    }));
});
