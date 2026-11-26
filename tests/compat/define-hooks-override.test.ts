import { describe, it } from 'vitest';
import { expectSameResult, type Lib } from '../support/compat.ts';

describe('compat: define hooks and model hooks of the same name', () => {
  it('the model hook replaces the define hook', () =>
    expectSameResult('', async (lib: Lib) => {
      const calls: string[] = [];
      const sequelize = new lib.Sequelize('postgres://u:p@localhost:1/db', {
        logging: false,
        define: {
          hooks: {
            beforeCreate: () => void calls.push('global create'),
            beforeUpdate: () => void calls.push('global update'),
          },
        },
      });
      const Model = sequelize.define(
        'M',
        {},
        { hooks: { beforeCreate: () => void calls.push('model create') } },
      );
      await (
        Model as unknown as { runHooks: (type: string, ...args: unknown[]) => Promise<void> }
      ).runHooks('beforeCreate', {}, {});
      await (
        Model as unknown as { runHooks: (type: string, ...args: unknown[]) => Promise<void> }
      ).runHooks('beforeUpdate', {}, {});
      await sequelize.close();
      return calls;
    }));
});
