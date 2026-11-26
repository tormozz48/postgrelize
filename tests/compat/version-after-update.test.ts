import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: optimistic locking after a partial save', () => {
  it('saves again after update and after save with fields', () =>
    expectSameResult('', async (lib, sequelize) => {
      const { INTEGER } = lib.DataTypes;
      const Account = sequelize.define('account', { number: INTEGER }, { version: true });
      await Account.sync();
      const account = await Account.create({ number: 1 });
      const steps: unknown[] = [];
      await account.update({ number: 2 });
      account.set('number', 3);
      await account.save();
      steps.push(account.get('version'), account.changed());
      account.set('number', 4);
      await account.save({ fields: ['number'] });
      await account.update({ number: 5 });
      const stored = await Account.findByPk(account.get('id') as number);
      steps.push(account.get('version'), stored!.get('number'), stored!.get('version'));
      return steps;
    }));
});
