import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

const message = (run: () => Promise<unknown>): Promise<string> =>
  Promise.resolve()
    .then(run)
    .then(
      () => 'ok',
      (error: Error & { sql?: string }) =>
        `${error.name}: ${error.message.replaceAll(/\([0-9a-f-]{36}\)/g, '(id)')} | sql=${error.sql}`,
    );

describe('compat: a finished transaction', () => {
  it('rejects queries after commit and rollback, also while the commit is in flight', () =>
    expectSameResult('', async (_lib, sequelize) => {
      const committed = await sequelize.transaction();
      await sequelize.query('SELECT 1+1', { transaction: committed, raw: true });
      await committed.commit();
      const rolledBack = await sequelize.transaction();
      await rolledBack.rollback();
      const racing = await sequelize.transaction();
      const [commit, racingQuery] = await Promise.all([
        message(() => racing.commit()),
        message(() => sequelize.query('SELECT 3', { transaction: racing, raw: true })),
      ]);
      return {
        afterCommit: await message(() =>
          sequelize.query('SELECT 1+1', { transaction: committed, raw: true }),
        ),
        afterRollback: await message(() =>
          sequelize.query('SELECT 2', { transaction: rolledBack, raw: true }),
        ),
        commit,
        racingQuery,
      };
    }));

  it('afterCommit requires a function', () =>
    expectSameResult('', async (_lib, sequelize) => {
      const out: Record<string, string> = {};
      for (const [name, value] of [
        ['null', null],
        ['undefined', undefined],
        ['object', {}],
        ['function', () => undefined],
      ] as const) {
        const t = await sequelize.transaction();
        out[name] = await message(async () =>
          (t as unknown as { afterCommit(fn: unknown): void }).afterCommit(value),
        );
        await t.rollback();
      }
      return out;
    }));
});
