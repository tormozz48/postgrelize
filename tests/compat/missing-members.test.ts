import { describe, it } from 'vitest';
import { expectSameResult, type Lib } from '../support/compat.ts';

describe('compat: v6 members', () => {
  it('has Sequelize, modelManager.all / findModel and ValidationErrorItem keys', () =>
    expectSameResult('', async (lib, sequelize) => {
      const User = sequelize.define('User', {});
      const v6 = sequelize as unknown as {
        Sequelize: Lib['Sequelize'];
        modelManager: { all: unknown[]; findModel: (f: (m: unknown) => boolean) => unknown };
      };
      const Item = lib.ValidationErrorItem as unknown as {
        new (...args: unknown[]): { getValidatorKey: (ns?: boolean, separator?: string) => string };
        Origins: object;
      };
      const item = new Item('m', 'unique violation', 'name', 'a', null, 'not_unique');
      return [
        v6.Sequelize === lib.Sequelize,
        v6.modelManager.all.length,
        v6.modelManager.findModel((model) => model === User) === User,
        item.getValidatorKey(),
        item.getValidatorKey(false),
        item.getValidatorKey(true, ':'),
        { ...Item.Origins },
      ];
    }));
});
