// #region imports
import { Effect, Exit } from 'effect';
import { DataTypes, UniqueConstraintError, type Sequelize } from 'postgrelize';
import * as Db from 'postgrelize/effect';
// #endregion imports

export const run = async (sequelize: Sequelize): Promise<void> => {
  const Account = sequelize.define('Account', {
    owner: { type: DataTypes.STRING, unique: true },
    balance: { type: DataTypes.INTEGER, allowNull: false },
  });
  await sequelize.sync();

  // #region operations
  const open = (owner: string, balance: number) => Db.create(Account, { owner, balance });

  const setup = Effect.gen(function* () {
    yield* open('ann', 100);
    yield* open('bob', 0);
    // Failures are the Sequelize v6 error classes: recover from a duplicate owner.
    return yield* open('ann', 1).pipe(
      Effect.catch((error) =>
        error instanceof UniqueConstraintError
          ? Effect.succeed('ann already exists')
          : Effect.fail(error),
      ),
    );
  });
  // #endregion operations

  // #region transaction
  const transfer = (from: string, to: string, amount: number) =>
    Db.transaction(sequelize, (transaction) =>
      Effect.gen(function* () {
        const source = yield* Db.findOne(Account, { where: { owner: from }, transaction });
        const balance = Number(source?.get('balance') ?? 0);
        if (balance < amount) {
          return yield* Effect.fail(new Error(`insufficient funds: ${from} has ${balance}`));
        }
        yield* Db.update(
          Account,
          { balance: balance - amount },
          { where: { owner: from }, transaction },
        );
        const target = yield* Db.findOne(Account, { where: { owner: to }, transaction });
        yield* Db.update(
          Account,
          { balance: Number(target?.get('balance') ?? 0) + amount },
          { where: { owner: to }, transaction },
        );
      }),
    );
  // #endregion transaction

  // #region run
  const recovered = await Effect.runPromise(setup);
  await Effect.runPromise(transfer('ann', 'bob', 30));
  const rejected = await Effect.runPromiseExit(transfer('bob', 'ann', 500));
  // #endregion run

  const balances = await Account.findAll({
    attributes: ['owner', 'balance'],
    order: [['owner', 'ASC']],
    raw: true,
  });
  if (
    recovered !== 'ann already exists' ||
    !Exit.isFailure(rejected) ||
    JSON.stringify(balances) !==
      JSON.stringify([
        { owner: 'ann', balance: 70 },
        { owner: 'bob', balance: 30 },
      ])
  ) {
    throw new Error('effect example: unexpected result');
  }
};
