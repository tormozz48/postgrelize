import { describe, it } from 'vitest';
import { expectSameError, expectSameResult, type Lib } from '../support/compat.ts';
import { TestNamespace } from '../support/cls-namespace.ts';
import type { Sequelize, Transaction } from '../../src/index.ts';

const SETUP = 'CREATE TABLE items (id serial PRIMARY KEY, label text NOT NULL)';

type Query = Sequelize['query'];

const useNamespace = (lib: Lib): TestNamespace => {
  const namespace = new TestNamespace();
  lib.Sequelize.useCLS(namespace);
  return namespace;
};

const labels = async (sequelize: Sequelize): Promise<unknown[]> => {
  const rows = (await sequelize.query('SELECT label FROM items ORDER BY id', {
    type: 'SELECT',
  } as Parameters<Query>[1])) as { label: string }[];
  return rows.map((row) => row.label);
};

const insert = (sequelize: Sequelize, label: string, options: object = {}): Promise<unknown> =>
  sequelize.query('INSERT INTO items (label) VALUES ($1)', { bind: [label], ...options });

const tx = (namespace: TestNamespace): Transaction | null | undefined =>
  namespace.get('transaction') as Transaction | null | undefined;

describe('Sequelize.useCLS(namespace) matches sequelize v6', () => {
  it('uses the managed transaction without a transaction option and commits', () =>
    expectSameResult(SETUP, async (lib, sequelize) => {
      const namespace = useNamespace(lib);
      const inside = await sequelize.transaction(async (t) => {
        await insert(sequelize, 'committed');
        return tx(namespace) === t;
      });
      return { inside, outside: tx(namespace) ?? null, labels: await labels(sequelize) };
    }));

  it('rolls back when the callback throws', () =>
    expectSameResult(SETUP, async (lib, sequelize) => {
      useNamespace(lib);
      const failure = await sequelize
        .transaction(async () => {
          await insert(sequelize, 'rolled back');
          throw new Error('boom');
        })
        .catch((error: Error) => error.message);
      return { failure, labels: await labels(sequelize) };
    }));

  it('honours a transaction a project stores in the namespace', () =>
    expectSameResult(SETUP, async (lib, sequelize) => {
      const namespace = useNamespace(lib);
      const t = await sequelize.transaction();
      await new Promise<void>((resolve, reject) => {
        namespace.run(() => {
          namespace.set('transaction', t);
          insert(sequelize, 'stored').then(() => resolve(), reject);
        });
      });
      await t.rollback();
      return labels(sequelize);
    }));

  it('does not join a transaction of the enclosing callback without an option', () =>
    expectSameResult(SETUP, async (lib, sequelize) => {
      const namespace = useNamespace(lib);
      const seen: unknown[] = [];
      await sequelize
        .transaction(async (outer) => {
          await sequelize.transaction(async (inner) => {
            seen.push([inner.parent === undefined || inner.parent === null, inner.id === outer.id]);
            await insert(sequelize, 'inner');
            seen.push(tx(namespace) === inner);
          });
          seen.push(tx(namespace) === outer);
          throw new Error('rollback outer');
        })
        .catch(() => undefined);
      return { seen, labels: await labels(sequelize) };
    }));

  it('stores a savepoint opened with an explicit parent in its own context', () =>
    expectSameResult(SETUP, async (lib, sequelize) => {
      const namespace = useNamespace(lib);
      const seen: unknown[] = [];
      await sequelize.transaction(async (outer) => {
        await sequelize.transaction({ transaction: outer }, async (savepoint) => {
          seen.push([tx(namespace) === savepoint, savepoint.parent === outer]);
          await insert(sequelize, 'savepoint');
        });
        seen.push(tx(namespace) === outer);
      });
      return { seen, labels: await labels(sequelize) };
    }));

  it('clears the namespace before afterCommit hooks run', () =>
    expectSameResult(SETUP, async (lib, sequelize) => {
      const namespace = useNamespace(lib);
      const seen: unknown[] = [];
      await sequelize.transaction(async (t) => {
        t.afterCommit(() => {
          seen.push(tx(namespace) ?? null);
        });
      });
      return seen;
    }));

  it('keeps concurrent managed transactions apart', () =>
    expectSameResult(SETUP, async (lib, sequelize) => {
      const namespace = useNamespace(lib);
      const mine = await Promise.all(
        [1, 2, 3, 4].map((n) =>
          sequelize.transaction(async (t) => {
            await insert(sequelize, `row-${n}`);
            await new Promise((resolve) => setTimeout(resolve, 5 * (5 - n)));
            await insert(sequelize, `row-${n}b`);
            return tx(namespace) === t;
          }),
        ),
      );
      return { mine, count: (await labels(sequelize)).length };
    }));

  it('rejects a value that is not a namespace', () =>
    expectSameError(SETUP, async (lib) => {
      lib.Sequelize.useCLS({} as never);
    }));

  it('hooks receive the current transaction in their options', () =>
    expectSameResult(
      'CREATE TABLE hooked (id serial PRIMARY KEY, label text)',
      async (lib, sequelize) => {
        useNamespace(lib);
        const Hooked = sequelize.define(
          'Hooked',
          { label: lib.DataTypes.STRING },
          { tableName: 'hooked', timestamps: false },
        );
        const seen: Record<string, boolean> = {};
        let current: unknown;
        const record =
          (name: string) =>
          (...args: unknown[]) => {
            const options = args.at(-1) as { transaction?: unknown } | undefined;
            seen[name] = options?.transaction === current;
          };
        const hooks = Hooked as unknown as Record<
          string,
          (fn: (...args: unknown[]) => void) => void
        >;
        for (const name of [
          'beforeCreate',
          'afterCreate',
          'beforeFind',
          'afterFind',
          'beforeUpdate',
          'beforeBulkUpdate',
          'beforeDestroy',
          'beforeCount',
        ]) {
          hooks[name]?.(record(name));
        }
        await sequelize.transaction(async (t) => {
          current = t;
          const row = await Hooked.create({ label: 'a' });
          await Hooked.findAll();
          await Hooked.count();
          await Hooked.update({ label: 'b' }, { where: {}, individualHooks: true });
          await row.destroy();
        });
        return seen;
      },
    ));
});
