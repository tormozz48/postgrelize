import { describe, it } from 'vitest';
import { expectSameError, expectSameResult, type Lib } from '../support/compat.ts';
import type { Sequelize } from '../../src/index.ts';

const TABLES = `
  CREATE TABLE "Accounts" (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    age INTEGER,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    version INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ
  );`;

type Log = string[];

const defineAccount = (
  lib: Lib,
  sequelize: Sequelize,
  log: Log,
  extra: Record<string, unknown> = {},
) =>
  sequelize.define(
    'Account',
    {
      email: { type: lib.DataTypes.STRING, allowNull: false, validate: { isEmail: true } },
      name: {
        type: lib.DataTypes.STRING,
        validate: { len: { args: [2, 10], msg: 'name length' } },
      },
      age: { type: lib.DataTypes.INTEGER, validate: { min: 0, max: 150, isInt: true } },
      status: {
        type: lib.DataTypes.STRING,
        defaultValue: 'active',
        validate: { isIn: [['active', 'blocked']] },
      },
    },
    {
      paranoid: true,
      version: true,
      defaultScope: { where: { status: 'active' } },
      scopes: {
        adults: { where: { age: { [lib.Op.gte]: 18 } } },
        named: (name: string) => ({ where: { name } }),
        sorted: { order: [['id', 'DESC']] },
      },
      validate: {
        adultHasName(this: { age?: number | null; name?: string | null }) {
          if ((this.age ?? 0) >= 18 && !this.name) {
            throw new Error('adults need a name');
          }
        },
      },
      hooks: {
        beforeValidate: (instance: { email?: string }) => {
          log.push('beforeValidate');
          if (typeof instance.email === 'string') {
            instance.email = instance.email.trim().toLowerCase();
          }
        },
        afterValidate: () => void log.push('afterValidate'),
        beforeCreate: () => void log.push('beforeCreate'),
        afterCreate: () => void log.push('afterCreate'),
        beforeSave: () => void log.push('beforeSave'),
        afterSave: () => void log.push('afterSave'),
        beforeUpdate: () => void log.push('beforeUpdate'),
        afterUpdate: () => void log.push('afterUpdate'),
        beforeDestroy: () => void log.push('beforeDestroy'),
        afterDestroy: () => void log.push('afterDestroy'),
        beforeBulkCreate: () => void log.push('beforeBulkCreate'),
        afterBulkCreate: () => void log.push('afterBulkCreate'),
        beforeBulkUpdate: () => void log.push('beforeBulkUpdate'),
        afterBulkUpdate: () => void log.push('afterBulkUpdate'),
        beforeBulkDestroy: () => void log.push('beforeBulkDestroy'),
        afterBulkDestroy: () => void log.push('afterBulkDestroy'),
        beforeFind: () => void log.push('beforeFind'),
        afterFind: () => void log.push('afterFind'),
        beforeCount: () => void log.push('beforeCount'),
      },
      ...extra,
    },
  );

const seed = async (Account: ReturnType<typeof defineAccount>) =>
  Account.bulkCreate([
    { email: 'a@x.io', name: 'ann', age: 30 },
    { email: 'b@x.io', name: 'bob', age: 12 },
    { email: 'c@x.io', name: 'cid', age: 40, status: 'blocked' },
  ]);

const run = (
  scenario: (Account: ReturnType<typeof defineAccount>, log: Log, lib: Lib) => Promise<unknown>,
) =>
  expectSameResult(TABLES, async (lib, sequelize) => {
    const log: Log = [];
    const Account = defineAccount(lib, sequelize, log);
    await seed(Account);
    log.length = 0;
    const result = await scenario(Account, log, lib);
    return { result, log };
  });

describe('compat: hooks', () => {
  it('create runs validate and create/save hooks in v6 order', () =>
    run(async (Account) => Account.create({ email: '  NEW@X.IO ', name: 'neo', age: 20 })));

  it('instance update runs update hooks and saves hook changes', () =>
    run(async (Account) => {
      const ann = await Account.findOne({ where: { name: 'ann' } });
      ann?.set('age', 31);
      await ann?.save();
      return ann;
    }));

  it('bulk update / destroy with and without individual hooks', () =>
    run(async (Account) => {
      const [count] = await Account.update({ age: 15 }, { where: { name: 'ann' } });
      const [count2] = await Account.update(
        { age: 16 },
        { where: { name: 'ann' }, individualHooks: true },
      );
      const destroyed = await Account.destroy({ where: { name: 'bob' }, individualHooks: true });
      return [count, count2, destroyed];
    }));

  it('hooks: false skips hooks', () =>
    run(async (Account) => {
      await Account.create({ email: 'q@x.io' }, { hooks: false });
      return Account.findAll({ attributes: ['email'], hooks: false, order: [['id', 'ASC']] });
    }));

  it('named hook statics and removeHook', () =>
    expectSameResult(TABLES, async (lib, sequelize) => {
      const log: Log = [];
      const Account = defineAccount(lib, sequelize, [], { hooks: {} });
      Account.beforeCreate('tag', () => void log.push('named'));
      Account.addHook('beforeCreate', () => void log.push('anonymous'));
      await Account.create({ email: 'h@x.io' });
      Account.removeHook('beforeCreate', 'tag');
      await Account.create({ email: 'i@x.io' });
      return [
        log,
        Boolean(Account.hasHook('beforeCreate')),
        Boolean(Account.hasHook('afterDestroy')),
      ];
    }));
});

describe('compat: validation', () => {
  it('notNull, built-in and custom messages', () =>
    expectSameError(TABLES, async (lib, sequelize) => {
      const Account = defineAccount(lib, sequelize, []);
      return Account.create({ email: null as unknown as string });
    }));

  it('collects all failures into one ValidationError', () =>
    run(async (Account) =>
      Account.create({ email: 'not-an-email', name: 'x', age: 200, status: 'weird' }).catch(
        (error: Error & { errors: unknown[] }) => ({
          message: error.message,
          items: error.errors.map((item) => {
            const {
              message,
              type,
              path,
              value,
              origin,
              validatorKey,
              validatorName,
              validatorArgs,
            } = item as Record<string, unknown>;
            return {
              message,
              type,
              path,
              value,
              origin,
              validatorKey,
              validatorName,
              validatorArgs,
            };
          }),
        }),
      ),
    ));

  it('model-level validator', () =>
    run(async (Account) =>
      Account.create({ email: 'z@x.io', age: 40 }).catch((error: Error) => error.message),
    ));

  it('validate: false and instance.validate()', () =>
    run(async (Account) => {
      const saved = await Account.create({ email: 'bad', status: 'active' }, { validate: false });
      const built = Account.build({ email: 'ok@x.io', name: 'y' });
      const failure = await built.validate().catch((error: Error) => error.message);
      return [saved.get('email'), failure];
    }));

  it('bulkCreate validate: true raises AggregateError', () =>
    run(async (Account) =>
      Account.bulkCreate([{ email: 'ok@x.io' }, { email: 'nope' }], { validate: true }).catch(
        (error: Error & { errors: Error[] }) => [
          error.name,
          error.errors.map((item) => [item.name, item.message]),
        ],
      ),
    ));
});

describe('compat: scopes', () => {
  it('default scope, named, function and combined scopes, unscoped', () =>
    run(async (Account) =>
      Promise.all([
        Account.findAll({ attributes: ['name'], order: [['id', 'ASC']] }),
        Account.scope('adults').findAll({ attributes: ['name'], order: [['id', 'ASC']] }),
        Account.scope('defaultScope', 'adults', 'sorted').findAll({ attributes: ['name'] }),
        Account.scope({ method: ['named', 'cid'] }).findAll({ attributes: ['name'] }),
        Account.unscoped().count(),
        Account.count(),
        Account.scope('adults').findAll({ where: { status: 'blocked' }, attributes: ['name'] }),
      ]),
    ));

  it('addScope and unknown scope error', () =>
    run(async (Account, _log, lib) => {
      Account.addScope('young', { where: { age: { [lib.Op.lt]: 18 } } });
      const young = await Account.scope('young').findAll({ attributes: ['name'] });
      const duplicate = (() => {
        try {
          Account.addScope('young', {});
          return 'no error';
        } catch (error) {
          return (error as Error).message;
        }
      })();
      const unknown = (() => {
        try {
          Account.scope('nope');
          return 'no error';
        } catch (error) {
          return (error as Error).message;
        }
      })();
      return [young, duplicate, unknown];
    }));
});

describe('compat: paranoid', () => {
  it('soft delete, paranoid: false, force, restore', () =>
    run(async (Account) => {
      await Account.destroy({ where: { name: 'ann' } });
      const visible = await Account.unscoped().findAll({
        attributes: ['name'],
        order: [['id', 'ASC']],
      });
      const all = await Account.unscoped().findAll({
        attributes: ['name'],
        paranoid: false,
        order: [['id', 'ASC']],
      });
      const ann = await Account.unscoped().findOne({ where: { name: 'ann' }, paranoid: false });
      const softDeleted = ann?.isSoftDeleted();
      await Account.restore({ where: { name: 'ann' } });
      const bob = await Account.findOne({ where: { name: 'bob' } });
      await bob?.destroy();
      const bobDeleted = await Account.unscoped().count({
        paranoid: false,
        where: { name: 'bob' },
      });
      await Account.unscoped().destroy({ where: { name: 'cid' }, force: true });
      const remaining = await Account.unscoped().count({ paranoid: false });
      return [visible, all, softDeleted, bobDeleted, remaining];
    }));
});

describe('compat: optimistic locking', () => {
  it('increments version and rejects stale instances', () =>
    run(async (Account) => {
      const first = await Account.findOne({ where: { name: 'ann' } });
      const second = await Account.findOne({ where: { name: 'ann' } });
      first?.set('age', 33);
      await first?.save();
      second?.set('age', 34);
      const stale = await second?.save().catch((error: Error) => error.name);
      return [first?.get('version'), stale];
    }));
});
