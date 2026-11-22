import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

type Hookable = {
  beforeDestroy(fn: (instance: unknown) => unknown): void;
  beforeRestore(fn: () => unknown): void;
  afterRestore(fn: () => unknown): void;
};

describe('compat: remaining hook semantics', () => {
  it('a beforeDestroy hook that changes a virtual attribute does not break the soft delete', () =>
    expectSameResult('', async (lib, sequelize) => {
      const User = sequelize.define(
        'ParanoidUser',
        {
          username: lib.DataTypes.STRING,
          virtualField: {
            type: lib.DataTypes.VIRTUAL,
            defaultValue: 0,
          },
        },
        { paranoid: true },
      );
      (User as unknown as Hookable).beforeDestroy((instance) => {
        (instance as { virtualField: number }).virtualField = 2;
      });
      await User.sync({ force: true });
      const user = await User.create({ username: 'user1' });
      await user.destroy();
      const found = await User.findOne({ paranoid: false });
      return { deleted: found?.get('deletedAt') !== null, virtual: found?.get('virtualField') };
    }));

  it('individualHooks of restore run beforeRestore for every row before the first error ends the call', () =>
    expectSameResult('', async (lib, sequelize) => {
      const User = sequelize.define(
        'ParanoidUser',
        { aNumber: lib.DataTypes.INTEGER },
        { paranoid: true },
      );
      const seen: string[] = [];
      (User as unknown as Hookable).beforeRestore(async () => {
        seen.push('before');
        throw new Error('You shall not pass!');
      });
      (User as unknown as Hookable).afterRestore(() => seen.push('after'));
      await User.sync({ force: true });
      await User.bulkCreate([{ aNumber: 1 }, { aNumber: 1 }, { aNumber: 1 }]);
      await User.destroy({ where: { aNumber: 1 } });
      const error = await User.restore({ where: { aNumber: 1 }, individualHooks: true }).then(
        () => 'none',
        (e: Error) => e.message,
      );
      return { message: error, seen };
    }));

  it('sequelize.options.hooks = {} removes the global hooks', () =>
    expectSameResult('', async (lib, sequelize) => {
      const seen: string[] = [];
      sequelize.addHook('beforeDefine', () => {
        seen.push('define');
      });
      sequelize.define('One', { name: lib.DataTypes.STRING });
      (sequelize.options as { hooks: unknown }).hooks = {};
      sequelize.define('Two', { name: lib.DataTypes.STRING });
      return { seen, hasHook: !!sequelize.hasHook('beforeDefine') };
    }));

  it('sequelize.modelManager lists, finds and removes models', () =>
    expectSameResult('', async (lib, sequelize) => {
      const Model = sequelize.define('Temp', { name: lib.DataTypes.STRING });
      const manager = (
        sequelize as unknown as {
          modelManager: {
            models: { name: string }[];
            getModel(name: string): unknown;
            removeModel(model: unknown): void;
          };
        }
      ).modelManager;
      const before = manager.models.map((model) => model.name);
      const found = manager.getModel('Temp') === Model;
      manager.removeModel(Model);
      return {
        before,
        found,
        after: manager.models.map((model) => model.name),
        isDefined: sequelize.isDefined('Temp'),
      };
    }));
});
