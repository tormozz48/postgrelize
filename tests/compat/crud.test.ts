import { describe, it } from 'vitest';
import { expectSameError, expectSameResult, type Lib } from '../support/compat.ts';
import type { Sequelize } from '../../src/index.ts';

const USERS = `
  CREATE TABLE "Users" (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    age INTEGER,
    score DECIMAL(10,2),
    big BIGINT,
    born DATE,
    tags TEXT[],
    meta JSONB,
    active BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL,
    "updatedAt" TIMESTAMPTZ NOT NULL
  );`;

const defineUser = (lib: Lib, sequelize: Sequelize) =>
  sequelize.define('User', {
    name: { type: lib.DataTypes.STRING, allowNull: false },
    email: { type: lib.DataTypes.STRING, unique: true },
    age: lib.DataTypes.INTEGER,
    score: lib.DataTypes.DECIMAL(10, 2),
    big: lib.DataTypes.BIGINT,
    born: lib.DataTypes.DATEONLY,
    tags: lib.DataTypes.ARRAY(lib.DataTypes.TEXT),
    meta: lib.DataTypes.JSONB,
    active: { type: lib.DataTypes.BOOLEAN, defaultValue: true },
  });

const seed = [
  {
    name: 'ann',
    email: 'ann@x.io',
    age: 31,
    score: '10.50',
    big: '9007199254740993',
    born: '1990-01-02',
    tags: ['a', 'b'],
    meta: { role: 'admin', level: 3 },
  },
  {
    name: 'bob',
    email: 'bob@x.io',
    age: 25,
    score: '7.25',
    big: '1',
    born: '1999-05-06',
    tags: ['b'],
    meta: { role: 'user', level: 1 },
  },
  { name: 'cid', email: null, age: null, score: null, big: null, born: null, tags: [], meta: null },
];

const withUsers = (
  run: (User: ReturnType<typeof defineUser>, lib: Lib, sequelize: Sequelize) => Promise<unknown>,
) =>
  expectSameResult(USERS, async (lib, sequelize) => {
    const User = defineUser(lib, sequelize);
    await User.bulkCreate(seed);
    return run(User, lib, sequelize);
  });

describe('compat: create and read', () => {
  it('create returns the saved instance with id and defaults', () =>
    expectSameResult(USERS, async (lib, sequelize) => {
      const User = defineUser(lib, sequelize);
      const user = await User.create({ name: 'zed', tags: ['x'], meta: { a: [1, 2] } });
      return [user, user.isNewRecord, user.changed()];
    }));

  it('build + save and instance update', () =>
    expectSameResult(USERS, async (lib, sequelize) => {
      const User = defineUser(lib, sequelize);
      const user = User.build({ name: 'x' });
      const before = user.toJSON();
      await user.save();
      user.set('age', 40);
      const changed = user.changed();
      await user.save();
      await user.update({ name: 'y' });
      await user.reload();
      return [before, changed, user];
    }));

  it('bulkCreate returns instances with ids', () =>
    withUsers(async (User) => User.findAll({ order: [['id', 'ASC']] })));

  it('findAll with operators', () =>
    withUsers(async (User, lib) => {
      const { Op } = lib;
      const queries = [
        { age: { [Op.gte]: 25, [Op.lt]: 31 } },
        { age: null },
        { age: { [Op.ne]: null } },
        { name: ['ann', 'cid'] },
        { name: { [Op.notIn]: ['ann'] } },
        { name: { [Op.like]: 'a%' } },
        { name: { [Op.iLike]: { [Op.any]: ['A%', 'B%'] } } },
        { name: { [Op.startsWith]: 'b' } },
        { email: { [Op.endsWith]: '.io' } },
        { name: { [Op.substring]: 'i' } },
        { age: { [Op.between]: [20, 30] } },
        { [Op.or]: [{ name: 'ann' }, { age: 25 }] },
        { [Op.and]: [{ active: true }, { age: { [Op.gt]: 20 } }] },
        { age: { [Op.or]: [25, 31] } },
        { name: { [Op.not]: 'ann' } },
        { active: { [Op.is]: true } },
        { tags: { [Op.contains]: ['b'] } },
        { tags: { [Op.overlap]: ['a', 'z'] } },
        { meta: { role: 'admin' } },
        { meta: { level: { [Op.gt]: 2 } } },
        { 'meta.role': 'user' },
        { meta: { [Op.contains]: { role: 'user' } } },
        { name: { [Op.regexp]: '^[ab]' } },
        { age: { [Op.in]: [] } },
        lib.where(lib.fn('lower', lib.col('name')), 'bob'),
      ];
      return Promise.all(
        queries.map((where) =>
          User.findAll({
            where: where as never,
            order: [['id', 'ASC']],
            attributes: ['id', 'name'],
          }),
        ),
      );
    }));

  it('attributes, order, limit, offset, raw', () =>
    withUsers(async (User, lib) =>
      Promise.all([
        User.findAll({
          attributes: ['name', ['age', 'years']],
          order: [['age', 'DESC NULLS LAST']],
          limit: 2,
          offset: 0,
        }),
        User.findAll({
          attributes: { exclude: ['meta', 'tags', 'createdAt', 'updatedAt'] },
          order: [['name', 'DESC']],
        }),
        User.findAll({
          attributes: [[lib.fn('upper', lib.col('name')), 'upper']],
          order: [[lib.col('name'), 'ASC']],
          raw: true,
        }),
        User.findAll({
          where: { active: true },
          raw: true,
          order: [['id', 'ASC']],
          attributes: ['id', 'score', 'big', 'born'],
        }),
      ]),
    ));

  it('findOne, findByPk, count, findAndCountAll', () =>
    withUsers(async (User, lib) =>
      Promise.all([
        User.findOne({ where: { name: 'bob' } }),
        User.findOne({ where: { name: 'nobody' } }),
        User.findByPk(1),
        User.findByPk(999),
        User.count(),
        User.count({ where: { age: { [lib.Op.gt]: 26 } } }),
        User.count({ col: 'email', distinct: true }),
        User.findAndCountAll({ where: { active: true }, limit: 1, order: [['id', 'ASC']] }),
        User.findOne({ where: { name: 'nobody' }, rejectOnEmpty: true }).catch(
          (error: unknown) => error,
        ),
      ]),
    ));

  it('aggregates', () =>
    withUsers(async (User) =>
      Promise.all([
        User.max('age'),
        User.min('age'),
        User.sum('age'),
        User.max('born'),
        User.max('score'),
        User.sum('score'),
      ]),
    ));
});

describe('compat: write', () => {
  it('static update with and without returning', () =>
    withUsers(async (User, lib) => {
      const plain = await User.update({ age: 50 }, { where: { name: 'ann' } });
      const returned = await User.update(
        { active: false },
        { where: { age: { [lib.Op.lt]: 30 } }, returning: true },
      );
      return [
        plain,
        returned,
        await User.findAll({ order: [['id', 'ASC']], attributes: ['name', 'age', 'active'] }),
      ];
    }));

  it('destroy and instance destroy', () =>
    withUsers(async (User) => {
      const count = await User.destroy({ where: { name: 'cid' } });
      const ann = await User.findOne({ where: { name: 'ann' } });
      await ann?.destroy();
      return [count, await User.count()];
    }));

  it('increment and decrement', () =>
    withUsers(async (User) => {
      const bob = await User.findOne({ where: { name: 'bob' } });
      await bob?.increment('age', { by: 5 });
      await bob?.decrement(['age']);
      await bob?.reload();
      await User.increment({ age: 2 }, { where: { name: 'ann' } });
      return [bob, await User.findOne({ where: { name: 'ann' }, attributes: ['age'] })];
    }));

  it('findOrCreate and findOrBuild', () =>
    withUsers(async (User) => {
      const [found, created1] = await User.findOrCreate({ where: { name: 'ann' } });
      const [made, created2] = await User.findOrCreate({
        where: { name: 'dan' },
        defaults: { age: 3 },
      });
      const [built, created3] = await User.findOrBuild({ where: { name: 'eve' } });
      return [found, created1, made, created2, built.isNewRecord, created3];
    }));

  it('unique constraint error', () =>
    expectSameError(USERS, async (lib, sequelize) => {
      const User = defineUser(lib, sequelize);
      await User.create({ name: 'ann', email: 'ann@x.io' });
      return User.create({ name: 'dup', email: 'ann@x.io' });
    }));

  it('truncate', () =>
    withUsers(async (User) => {
      await User.truncate();
      return User.count();
    }));
});

describe('compat: raw queries and transactions', () => {
  it('query result shapes', () =>
    withUsers(async (User, lib, sequelize) =>
      Promise.all([
        sequelize.query('SELECT name FROM "Users" WHERE age > :age ORDER BY id', {
          replacements: { age: 20 },
          type: lib.QueryTypes.SELECT,
        }),
        sequelize.query('SELECT name FROM "Users" WHERE name IN (?) ORDER BY id', {
          replacements: [['ann', 'bob']],
          type: lib.QueryTypes.SELECT,
        }),
        sequelize.query('SELECT name FROM "Users" WHERE id = $1', {
          bind: [2],
          type: lib.QueryTypes.SELECT,
          plain: true,
        }),
        sequelize.query('SELECT * FROM "Users" ORDER BY id', { model: User, mapToModel: true }),
      ]),
    ));

  it('managed transaction commits and rolls back', () =>
    withUsers(async (User, _lib, sequelize) => {
      await sequelize.transaction(async (transaction) => {
        await User.create({ name: 'in-tx' }, { transaction });
      });
      const failed = await sequelize
        .transaction(async (transaction) => {
          await User.create({ name: 'rolled-back' }, { transaction });
          throw new Error('boom');
        })
        .catch((error: unknown) => (error as Error).message);
      return [failed, await User.findAll({ attributes: ['name'], order: [['id', 'ASC']] })];
    }));

  it('unmanaged transaction', () =>
    withUsers(async (User, _lib, sequelize) => {
      const t1 = await sequelize.transaction();
      await User.update({ age: 1 }, { where: {}, transaction: t1 });
      await t1.rollback();
      const t2 = await sequelize.transaction();
      await User.destroy({ where: { name: 'cid' }, transaction: t2 });
      await t2.commit();
      return User.findAll({ attributes: ['name', 'age'], order: [['id', 'ASC']] });
    }));
});
