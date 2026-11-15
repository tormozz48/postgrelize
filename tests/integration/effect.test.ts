import { Effect, Exit, Fiber } from 'effect';
import { afterEach, describe, expect, it } from 'vitest';
import { DataTypes, Sequelize, UniqueConstraintError } from '../../src/index.ts';
import * as Db from '../../src/effect/index.ts';
import { testDatabaseUrl } from '../support/db-url.ts';
import { withSchema } from '../support/with-schema.ts';

const opened: Sequelize[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((sequelize) => sequelize.close()));
});

const setup = async (schema: string) => {
  const sequelize = new Sequelize(testDatabaseUrl(), {
    logging: false,
    pool: { max: 1, acquire: 3000 },
    dialectOptions: { options: `-c search_path=${schema}` },
  });
  opened.push(sequelize);
  const User = sequelize.define('User', { email: { type: DataTypes.STRING, unique: true } });
  await sequelize.sync();
  return { sequelize, User };
};

describe('postgrelize/effect', () => {
  it('runs model operations and reports v6 errors in the error channel', () =>
    withSchema(async ({ schema }) => {
      const { User } = await setup(schema);
      const program = Effect.gen(function* () {
        yield* Db.create(User, { email: 'a@x.io' });
        yield* Db.bulkCreate(User, [{ email: 'b@x.io' }]);
        const duplicate = yield* Effect.flip(Db.create(User, { email: 'a@x.io' }));
        const total = yield* Db.count(User);
        const found = yield* Db.findOne(User, { where: { email: 'b@x.io' } });
        return { duplicate, total, email: found?.get('email') };
      });
      const result = await Effect.runPromise(program);
      expect(result.duplicate).toBeInstanceOf(UniqueConstraintError);
      expect([result.total, result.email]).toEqual([2, 'b@x.io']);
    }));

  it('commits a successful transaction and rolls back a failed one', () =>
    withSchema(async ({ schema }) => {
      const { sequelize, User } = await setup(schema);
      await Effect.runPromise(
        Db.transaction(sequelize, (transaction) =>
          Db.create(User, { email: 'kept@x.io' }, { transaction }),
        ),
      );
      const failed = await Effect.runPromiseExit(
        Db.transaction(sequelize, (transaction) =>
          Db.create(User, { email: 'lost@x.io' }, { transaction }).pipe(
            Effect.andThen(Effect.fail('boom' as const)),
          ),
        ),
      );
      expect(Exit.isFailure(failed)).toBe(true);
      expect(await User.findAll({ attributes: ['email'], raw: true })).toEqual([
        { email: 'kept@x.io' },
      ]);
    }));

  it('rolls back and releases the client when the program is interrupted', () =>
    withSchema(async ({ schema }) => {
      const { sequelize, User } = await setup(schema);
      const fiber = Effect.runFork(
        Db.transaction(sequelize, (transaction) =>
          Db.create(User, { email: 'interrupted@x.io' }, { transaction }).pipe(
            Effect.andThen(Effect.never),
          ),
        ),
      );
      await new Promise((resolve) => setTimeout(resolve, 200));
      await Effect.runPromise(Fiber.interrupt(fiber));
      // The pool has a single connection: this query only runs if the transaction released it.
      expect(await User.count()).toBe(0);
    }));

  it('releases the client when starting a transaction fails', () =>
    withSchema(async ({ schema }) => {
      const { sequelize, User } = await setup(schema);
      await expect(
        sequelize.transaction({ settings: { statement_timeout: 'not a duration' } }),
      ).rejects.toThrow(/statement_timeout/);
      expect(await User.count()).toBe(0);
    }));
});
