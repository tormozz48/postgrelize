import { DataTypes, DatabaseError, Transaction, type Sequelize } from 'postgrelize';

export const run = async (sequelize: Sequelize): Promise<void> => {
  const Account = sequelize.define(
    'Account',
    { owner: DataTypes.TEXT, balance: { type: DataTypes.INTEGER, allowNull: false } },
    { timestamps: false },
  );
  await sequelize.sync();
  await Account.bulkCreate([
    { owner: 'ann', balance: 100 },
    { owner: 'bob', balance: 0 },
  ]);

  // #region managed
  await sequelize.transaction(async (transaction) => {
    await Account.decrement('balance', { by: 30, where: { owner: 'ann' }, transaction });
    await Account.increment('balance', { by: 30, where: { owner: 'bob' }, transaction });
  });

  const failed = await sequelize
    .transaction(async (transaction) => {
      await Account.update({ balance: 0 }, { where: {}, transaction });
      throw new Error('abort');
    })
    .catch((error: Error) => error.message);
  // failed === 'abort'; the update was rolled back
  // #endregion managed

  // #region unmanaged
  const transaction = await sequelize.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.REPEATABLE_READ,
  });
  const committed: string[] = [];
  transaction.afterCommit(() => {
    committed.push(transaction.id);
  });
  try {
    await Account.create({ owner: 'cid', balance: 5 }, { transaction });
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
  // #endregion unmanaged

  // #region savepoints
  await sequelize.transaction(async (outer) => {
    await Account.create({ owner: 'dan', balance: 1 }, { transaction: outer });
    await sequelize
      .transaction({ transaction: outer }, async (inner) => {
        await Account.create({ owner: 'eve', balance: 1 }, { transaction: inner });
        throw new Error('rolls back to the savepoint only');
      })
      .catch(() => undefined);
  });
  // dan is saved, eve is not
  // #endregion savepoints

  // #region locking
  const holder = await sequelize.transaction();
  await Account.findAll({ where: { owner: 'ann' }, lock: true, transaction: holder });

  const free = await sequelize.transaction((worker) =>
    Account.findAll({ lock: Transaction.LOCK.UPDATE, skipLocked: true, transaction: worker }),
  );
  const noWait = await sequelize
    .transaction((worker) =>
      Account.findAll({ where: { owner: 'ann' }, lock: true, noWait: true, transaction: worker }),
    )
    .catch((error: unknown) => error);
  await holder.rollback();
  // free: every row except ann's; noWait: DatabaseError (could not obtain lock)
  // #endregion locking

  // #region read-only
  const readOnly = await sequelize
    .transaction({ readOnly: true }, (tx) =>
      Account.create({ owner: 'x', balance: 0 }, { transaction: tx }),
    )
    .catch((error: unknown) => error);
  // readOnly: DatabaseError (cannot execute INSERT in a read-only transaction)
  // #endregion read-only

  const balances = (await Account.findAll({ order: [['owner', 'ASC']] })).map(
    (row) => `${String(row.get('owner'))}:${String(row.get('balance'))}`,
  );
  if (
    failed !== 'abort' ||
    committed.length !== 1 ||
    balances.join(',') !== 'ann:70,bob:30,cid:5,dan:1' ||
    free.length !== 3 ||
    !(noWait instanceof DatabaseError) ||
    !(readOnly instanceof DatabaseError)
  ) {
    throw new Error('transactions example: unexpected result');
  }
};
