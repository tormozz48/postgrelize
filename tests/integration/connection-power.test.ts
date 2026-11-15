import { afterEach, describe, expect, it } from 'vitest';
import { DataTypes, Sequelize } from '../../src/index.ts';
import { testDatabaseUrl } from '../support/db-url.ts';
import { withSchema } from '../support/with-schema.ts';

const opened: Sequelize[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((sequelize) => sequelize.close()));
});

const setup = async (schema: string, logging: ((sql: string) => void) | false = false) => {
  const sequelize = new Sequelize(testDatabaseUrl(), {
    logging,
    dialectOptions: { options: `-c search_path=${schema}` },
  });
  opened.push(sequelize);
  const Event = sequelize.define('Event', {
    kind: DataTypes.TEXT,
    payload: DataTypes.JSONB,
    tags: DataTypes.ARRAY(DataTypes.TEXT),
    seen: DataTypes.BOOLEAN,
  });
  await sequelize.sync();
  return { sequelize, Event };
};

async function* generate() {
  for (let index = 0; index < 1000; index += 1) {
    yield { kind: `k${index}`, payload: { index }, seen: index % 2 === 0 };
  }
}

describe('COPY', () => {
  it('bulk-loads rows from arrays and async iterables with escaping', () =>
    withSchema(async ({ schema }) => {
      const { Event } = await setup(schema);
      const tricky = 'tab\there\nnew line \\ backslash';
      const copied = await Event.copyFrom([
        { kind: tricky, payload: { a: [1, 'x"y'] }, tags: ['a b', 'c"d', 'e\\f'], seen: true },
        { kind: 'null-ish', payload: null, tags: null, seen: false },
      ]);
      expect(copied).toBe(2);
      expect(await Event.copyFrom(generate(), { columns: ['kind', 'payload', 'seen'] })).toBe(1000);
      const first = await Event.findOne({ where: { kind: tricky } });
      expect(first?.get('payload')).toEqual({ a: [1, 'x"y'] });
      expect(first?.get('tags')).toEqual(['a b', 'c"d', 'e\\f']);
      expect(first?.get('createdAt')).toBeInstanceOf(Date);
      expect(await Event.count()).toBe(1002);
      await expect(Event.copyFrom(generate())).rejects.toThrow(/columns are required/);
    }));

  it('rolls back with the transaction and maps errors', () =>
    withSchema(async ({ schema }) => {
      const { Event, sequelize } = await setup(schema);
      await sequelize
        .transaction(async (transaction) => {
          await Event.copyFrom([{ kind: 'x' }], { transaction });
          throw new Error('rollback');
        })
        .catch(() => undefined);
      expect(await Event.count()).toBe(0);
      await expect(Event.copyFrom([{ kind: 'x', seen: 'maybe' as never }])).rejects.toThrow(
        /invalid input syntax for type boolean/,
      );
    }));
});

describe('findEach', () => {
  it('streams rows in batches with a cursor and closes it on early exit', () =>
    withSchema(async ({ schema }) => {
      const logged: string[] = [];
      const { Event } = await setup(schema, (sql) => logged.push(sql));
      await Event.copyFrom(
        Array.from({ length: 250 }, (_, index) => ({ kind: `k${index}` })),
        { columns: ['kind'] },
      );
      const kinds: string[] = [];
      for await (const event of Event.findEach({ order: [['id', 'ASC']] }, { batchSize: 100 })) {
        kinds.push(String(event.get('kind')));
      }
      expect(kinds).toHaveLength(250);
      expect(kinds.slice(0, 2)).toEqual(['k0', 'k1']);
      expect(logged.filter((sql) => sql.includes('FETCH 100'))).toHaveLength(4);
      const partial: string[] = [];
      for await (const event of Event.findEach({ order: [['id', 'ASC']] }, { batchSize: 10 })) {
        partial.push(String(event.get('kind')));
        if (partial.length === 3) {
          break;
        }
      }
      expect(partial).toEqual(['k0', 'k1', 'k2']);
      expect(logged.some((sql) => sql.includes('COMMIT'))).toBe(true);
      await expect(Event.findEach({}, { batchSize: 0 }).next()).rejects.toThrow(/batchSize/);
    }));
});

describe('LISTEN / NOTIFY', () => {
  it('delivers notifications and unsubscribes', () =>
    withSchema(async ({ schema }) => {
      const { sequelize } = await setup(schema);
      const received: Array<[string | undefined, string]> = [];
      const unlisten = await sequelize.listen('pgz_events', (payload, channel) => {
        received.push([payload, channel]);
      });
      await sequelize.notify('pgz_events', { id: 1 });
      await sequelize.transaction(async (transaction) => {
        await sequelize.notify('pgz_events', 'in-tx', { transaction });
      });
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(received).toEqual([
        ['{"id":1}', 'pgz_events'],
        ['in-tx', 'pgz_events'],
      ]);
      await unlisten();
      await sequelize.notify('pgz_events', 'after');
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(received).toHaveLength(2);
    }));
});

describe('transaction settings and advisory locks', () => {
  it('applies SET LOCAL settings only inside the transaction', () =>
    withSchema(async ({ schema }) => {
      const { sequelize } = await setup(schema);
      const inside = await sequelize.transaction(
        { settings: { 'app.user_id': 42, statement_timeout: '1234ms' } },
        async (transaction) =>
          sequelize.query(
            "SELECT current_setting('app.user_id') AS user_id, current_setting('statement_timeout') AS timeout",
            {
              type: 'SELECT',
              plain: true,
              transaction,
            },
          ),
      );
      expect(inside).toEqual({ user_id: '42', timeout: '1234ms' });
      const outside = await sequelize.query(
        "SELECT current_setting('app.user_id', true) AS user_id",
        { type: 'SELECT', plain: true },
      );
      expect(outside).toEqual({ user_id: '' });
    }));

  it('serializes work with advisory locks', () =>
    withSchema(async ({ schema }) => {
      const { sequelize } = await setup(schema);
      const holder = await sequelize.transaction();
      await holder.advisoryLock('jobs:42');
      const competitor = await sequelize.transaction();
      expect(await competitor.tryAdvisoryLock('jobs:42')).toBe(false);
      expect(await competitor.tryAdvisoryLock(7)).toBe(true);
      await holder.commit();
      expect(await competitor.tryAdvisoryLock('jobs:42')).toBe(true);
      await competitor.rollback();
      const order: string[] = [];
      await Promise.all([
        sequelize.withAdvisoryLock(1, async () => {
          order.push('a-start');
          await new Promise((resolve) => setTimeout(resolve, 100));
          order.push('a-end');
        }),
        new Promise((resolve) => setTimeout(resolve, 20)).then(() =>
          sequelize.withAdvisoryLock(1, async () => {
            order.push('b');
          }),
        ),
      ]);
      expect(order).toEqual(['a-start', 'a-end', 'b']);
    }));
});

describe('transaction start failures', () => {
  it('rolls back and releases the client when BEGIN or settings fail', () =>
    withSchema(async ({ schema }) => {
      const sequelize = new Sequelize(testDatabaseUrl(), {
        logging: false,
        pool: { max: 1, acquire: 3000 },
        dialectOptions: { options: `-c search_path=${schema}` },
      });
      opened.push(sequelize);
      await expect(
        sequelize.transaction({ settings: { statement_timeout: 'not a duration' } }),
      ).rejects.toThrow(/statement_timeout/);
      // The pool has a single connection: this only works if it was released outside a transaction.
      const [row] = (await sequelize.query('SELECT 1 AS one', { type: 'SELECT' })) as {
        one: number;
      }[];
      expect(row?.one).toBe(1);
    }));
});
