import { afterEach, describe, expect, it } from 'vitest';
import { DataTypes, Op, Sequelize, type FindOptions, type Transaction } from '../../src/index.ts';
import { testDatabaseUrl } from '../support/db-url.ts';
import { withSchema } from '../support/with-schema.ts';

const opened: Sequelize[] = [];

afterEach(async () => {
  await Promise.all(opened.splice(0).map((sequelize) => sequelize.close()));
});

const setup = async (schema: string) => {
  const logged: string[] = [];
  const sequelize = new Sequelize(testDatabaseUrl(), {
    logging: (sql: string) => logged.push(sql),
    define: { schema, timestamps: false },
  });
  opened.push(sequelize);
  const Doc = sequelize.define('Doc', { title: DataTypes.TEXT });
  const Line = sequelize.define('Line', { memo: DataTypes.TEXT });
  const Note = sequelize.define('Note', { text: DataTypes.TEXT });
  Doc.hasMany(Line, { as: 'lines', foreignKey: 'docId' });
  Line.hasMany(Note, { as: 'notes', foreignKey: 'lineId' });
  await sequelize.sync();
  await Doc.create({ title: 'a' });
  await Line.create({ memo: 'm', docId: 1 });
  await Note.create({ text: 'n', lineId: 1 });
  return { sequelize, logged, Doc, Line, Note };
};

/** Runs `body` with two open transactions and rolls both back. */
const twoTransactions = async (
  sequelize: Sequelize,
  body: (holder: Transaction, other: Transaction) => Promise<void>,
): Promise<void> => {
  const holder = await sequelize.transaction();
  const other = await sequelize.transaction();
  try {
    await body(holder, other);
  } finally {
    await other.rollback();
    await holder.rollback();
  }
};

const raw = async (sequelize: Sequelize, transaction: Transaction, call: string) => {
  const row = await sequelize.query<{ ok: boolean }>(`SELECT ${call} AS ok`, {
    transaction,
    type: 'SELECT',
    plain: true,
  });
  return row?.ok;
};

// Advisory keys are database-wide; the project database is shared between files.
const KEY = 918_273;

describe('advisory lock identity', () => {
  it('a key pair is the lock of pg_advisory_xact_lock(int4, int4)', () =>
    withSchema(async ({ schema }) => {
      const { sequelize } = await setup(schema);
      await twoTransactions(sequelize, async (holder, other) => {
        await holder.advisoryLock(KEY, 5);
        expect(await raw(sequelize, other, `pg_try_advisory_xact_lock(${KEY}, 5)`)).toBe(false);
        expect(await other.tryAdvisoryLock(KEY, 5)).toBe(false);
        expect(await other.tryAdvisoryLock(KEY, 6)).toBe(true);
        // separate key space: the bigint with the same bits is another lock
        expect(await other.tryAdvisoryLock((BigInt(KEY) << 32n) | 5n)).toBe(true);
      });
    }));

  it('a raw pair lock blocks advisoryLock until the holder ends', () =>
    withSchema(async ({ schema }) => {
      const { sequelize } = await setup(schema);
      const holder = await sequelize.transaction();
      await raw(sequelize, holder, `pg_advisory_xact_lock(${KEY}, -7)`);
      const order: string[] = [];
      const waiting = sequelize.transaction(async (transaction) => {
        await transaction.advisoryLock(KEY, -7);
        order.push('waiter');
      });
      await waitForAdvisoryWaiter(sequelize, KEY);
      order.push('holder');
      await holder.commit();
      await waiting;
      expect(order).toEqual(['holder', 'waiter']);
    }));

  it('keeps the identity of one-key locks', () =>
    withSchema(async ({ schema }) => {
      const { sequelize } = await setup(schema);
      await twoTransactions(sequelize, async (holder, other) => {
        await holder.advisoryLock('row-advisory:1');
        await holder.advisoryLock(KEY);
        const hashed = "pg_try_advisory_xact_lock(hashtextextended('row-advisory:1', 0))";
        expect(await raw(sequelize, other, hashed)).toBe(false);
        expect(await raw(sequelize, other, `pg_try_advisory_xact_lock(${KEY}::bigint)`)).toBe(
          false,
        );
      });
    }));

  it('shares shared pair locks and refuses exclusive ones', () =>
    withSchema(async ({ schema }) => {
      const { sequelize } = await setup(schema);
      await twoTransactions(sequelize, async (holder, other) => {
        await holder.advisoryLock(KEY, 8, { shared: true });
        expect(await other.tryAdvisoryLock(KEY, 8)).toBe(false);
        expect(await other.tryAdvisoryLock(KEY, 8, { shared: true })).toBe(true);
      });
    }));
});

describe('session advisory locks', () => {
  it('outlive a savepoint rollback and are released early by advisoryUnlock', () =>
    withSchema(async ({ schema }) => {
      const { sequelize } = await setup(schema);
      await twoTransactions(sequelize, async (holder, other) => {
        const savepoint = await sequelize.transaction({ transaction: holder });
        await savepoint.advisoryLock(KEY, 9, { session: true });
        await savepoint.rollback();
        expect(await other.tryAdvisoryLock(KEY, 9)).toBe(false);
        expect(await holder.advisoryUnlock(KEY, 9)).toBe(true);
        expect(await other.tryAdvisoryLock(KEY, 9)).toBe(true);
      });
    }));

  it.each(['commit', 'rollback'] as const)('do not outlive %s', (end) =>
    withSchema(async ({ schema }) => {
      const { sequelize } = await setup(schema);
      const holder = await sequelize.transaction();
      const other = await sequelize.transaction();
      const savepoint = await sequelize.transaction({ transaction: holder });
      expect(await savepoint.tryAdvisoryLock(KEY, 10, { session: true })).toBe(true);
      await savepoint.commit();
      expect(await other.tryAdvisoryLock(KEY, 10)).toBe(false);
      await holder[end]();
      expect(await other.tryAdvisoryLock(KEY, 10)).toBe(true);
      await other.rollback();
    }),
  );
});

const waitForAdvisoryWaiter = async (sequelize: Sequelize, classid: number): Promise<void> => {
  const row = await sequelize.query<{ n: string }>(
    `SELECT count(*) AS n FROM pg_locks WHERE locktype = 'advisory' AND classid = ${classid} AND NOT granted`,
    { type: 'SELECT', plain: true },
  );
  if (Number(row?.n) === 0) {
    await waitForAdvisoryWaiter(sequelize, classid);
  }
};

type Models = Awaited<ReturnType<typeof setup>>;

/** Locks with `options`, then reports which tables another transaction finds locked. */
const lockedTables = async (
  models: Models,
  lock: (transaction: Transaction) => Promise<unknown>,
): Promise<string[]> => {
  const locked: string[] = [];
  await twoTransactions(models.sequelize, async (holder, other) => {
    await lock(holder);
    for (const model of [models.Doc, models.Line, models.Note]) {
      const options: FindOptions = { transaction: other, lock: true, skipLocked: true };
      if ((await model.findAll(options)).length === 0) {
        locked.push(model.name);
      }
    }
  });
  return locked;
};

const NESTED = (models: Models) => [
  { model: models.Line, as: 'lines', include: [{ model: models.Note, as: 'notes' }] },
];

describe('row locks of named tables', () => {
  it('locks only the main table across outer joins', () =>
    withSchema(async ({ schema }) => {
      const models = await setup(schema);
      const locked = await lockedTables(models, (transaction) =>
        models.Doc.findAll({
          include: NESTED(models),
          lock: { level: 'NO KEY UPDATE', of: 'Doc' },
          transaction,
        }),
      );
      expect(locked).toEqual(['Doc']);
      expect(models.logged.join('\n')).toContain('FOR NO KEY UPDATE OF "Doc"');
    }));

  it('locks included and nested aliases', () =>
    withSchema(async ({ schema }) => {
      const models = await setup(schema);
      const include = [
        {
          model: models.Line,
          as: 'lines',
          required: true,
          include: [{ model: models.Note, as: 'notes', required: true }],
        },
      ];
      const locked = await lockedTables(models, (transaction) =>
        models.Doc.findAll({
          include,
          lock: { level: 'UPDATE', of: ['lines', 'lines->notes'] },
          transaction,
        }),
      );
      expect(locked).toEqual(['Line', 'Note']);
    }));

  it('locks the main table of a limited query with include', () =>
    withSchema(async ({ schema }) => {
      const models = await setup(schema);
      const locked = await lockedTables(models, (transaction) =>
        models.Doc.findAll({
          include: NESTED(models),
          limit: 1,
          lock: { level: 'UPDATE', of: models.Doc },
          transaction,
        }),
      );
      expect(locked).toEqual(['Doc']);
    }));

  it('fails with NOWAIT and skips with SKIP LOCKED', () =>
    withSchema(async ({ schema }) => {
      const { sequelize, Doc } = await setup(schema);
      await twoTransactions(sequelize, async (holder, other) => {
        const lock = { level: 'UPDATE', of: ['Doc'] } as const;
        await Doc.findAll({ lock, transaction: holder });
        expect(await Doc.findAll({ lock, skipLocked: true, transaction: other })).toEqual([]);
        await expect(Doc.findAll({ lock, noWait: true, transaction: other })).rejects.toMatchObject(
          {
            parent: { code: '55P03' },
          },
        );
      });
    }));

  it('locks inside Model.subquery', () =>
    withSchema(async ({ schema }) => {
      const models = await setup(schema);
      const { Doc, Line } = models;
      const locked = await lockedTables(models, (transaction) =>
        Doc.findAll({
          where: {
            id: {
              [Op.in]: Line.subquery({
                attributes: ['docId'],
                lock: { level: 'UPDATE', of: 'Line' },
                skipLocked: true,
              }),
            },
          },
          transaction,
        }),
      );
      expect(locked).toEqual(['Line']);
    }));

  it('shows options.lock to beforeFind hooks', () =>
    withSchema(async ({ schema }) => {
      const { sequelize, Doc } = await setup(schema);
      const seen: unknown[] = [];
      Doc.addHook('beforeFind', 'guard', (options: FindOptions) => {
        seen.push(options.lock);
      });
      const lock = { level: 'UPDATE', of: 'Doc', skipOrderGuard: true } as const;
      await sequelize.transaction((transaction) => Doc.findAll({ lock, transaction }));
      expect(seen).toEqual([lock]);
    }));
});
