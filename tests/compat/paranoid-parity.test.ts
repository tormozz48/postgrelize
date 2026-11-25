import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

const names = (rows: ReadonlyArray<{ get(key: string): unknown }>): unknown[] =>
  rows.map((row) => row.get('name')).toSorted();

const outcome = async (run: () => Promise<unknown>): Promise<unknown> =>
  run().then(
    () => 'ok',
    (error: Error) => error.name,
  );

describe('compat: paranoid parity', () => {
  it('destroying a soft-deleted instance again keeps the first deletedAt', () =>
    expectSameResult('', async (lib, sequelize) => {
      const User = sequelize.define(
        'ParanoidUser',
        { name: lib.DataTypes.STRING },
        { paranoid: true },
      );
      await sequelize.sync({ force: true });
      const user = await User.create({ name: 'a' });
      await user.destroy();
      await user.reload({ paranoid: false });
      const first = (user.get('deletedAt') as Date).getTime();
      await user.destroy();
      await user.reload({ paranoid: false });
      return { unchanged: (user.get('deletedAt') as Date).getTime() === first };
    }));

  it('a custom deletedAt default marks "not deleted": filters, destroy, restore, isSoftDeleted', () =>
    expectSameResult('', async (lib, sequelize) => {
      const epoch = new Date(0);
      const User = sequelize.define(
        'EpochUser',
        {
          name: lib.DataTypes.STRING,
          deletedAt: { type: lib.DataTypes.DATE, defaultValue: epoch },
        },
        { paranoid: true },
      );
      await sequelize.sync({ force: true });
      const [a] = await User.bulkCreate([{ name: 'a' }, { name: 'b' }], { returning: true });
      const alive = await User.findAll();
      await a!.destroy();
      const afterSoft = names(await User.findAll());
      const soft = a!.isSoftDeleted();
      const again = (await a!.destroy()) as unknown as { get(key: string): unknown };
      const kept = (again.get('deletedAt') as Date).getTime() !== epoch.getTime();
      const counts = [await User.count(), await User.count({ paranoid: false })];
      await a!.restore();
      const restored = (a!.get('deletedAt') as Date).getTime();
      await User.destroy({ where: { name: 'b' } });
      const afterBulk = names(await User.findAll());
      await User.restore({ where: { name: 'b' } });
      return {
        alive: names(alive),
        afterSoft,
        soft,
        kept,
        counts,
        restored,
        afterBulk,
        afterRestore: names(await User.findAll()),
        notSoft: a!.isSoftDeleted(),
      };
    }));

  it('a soft-deleted row blocks and survives bulkCreate / upsert / findOrCreate on its key', () =>
    expectSameResult('', async (lib, sequelize) => {
      const User = sequelize.define(
        'Keyed',
        { name: { type: lib.DataTypes.STRING, unique: true }, n: lib.DataTypes.INTEGER },
        { paranoid: true },
      );
      await sequelize.sync({ force: true });
      await User.create({ name: 'a', n: 1 });
      await User.destroy({ where: { name: 'a' } });
      const created = await outcome(() => User.bulkCreate([{ name: 'a', n: 2 }]));
      const found = await outcome(() =>
        User.findOrCreate({ where: { name: 'a' }, defaults: { n: 3 } }),
      );
      const upserted = await outcome(() => User.upsert({ name: 'a', n: 4 }));
      const all = await User.findAll({ paranoid: false, order: [['id', 'ASC']] });
      return {
        created,
        found,
        upserted,
        rows: all.map((row) => [row.get('name'), row.get('n'), row.get('deletedAt') !== null]),
      };
    }));

  it('a partial unique index on deletedAt IS NULL allows re-creating a soft-deleted key', () =>
    expectSameResult('', async (lib, sequelize) => {
      const User = sequelize.define(
        'Partial',
        { name: lib.DataTypes.STRING },
        {
          paranoid: true,
          indexes: [{ unique: true, fields: ['name'], where: { deletedAt: null } }],
        },
      );
      await sequelize.sync({ force: true });
      await User.create({ name: 'a' });
      await User.destroy({ where: { name: 'a' } });
      await User.create({ name: 'a' });
      const duplicate = await User.create({ name: 'a' }).then(
        () => 'ok',
        (error: Error) => error.name,
      );
      return { duplicate, live: await User.count(), all: await User.count({ paranoid: false }) };
    }));

  it('count, findAndCountAll and include honour paranoid and paranoid: false', () =>
    expectSameResult('', async (lib, sequelize) => {
      const Owner = sequelize.define('Owner', { name: lib.DataTypes.STRING }, { paranoid: true });
      const Pet = sequelize.define('Pet', { name: lib.DataTypes.STRING }, { paranoid: true });
      Owner.hasMany(Pet);
      Pet.belongsTo(Owner);
      await sequelize.sync({ force: true });
      const [o1, o2] = await Owner.bulkCreate([{ name: 'o1' }, { name: 'o2' }], {
        returning: true,
      });
      await Pet.bulkCreate(
        [
          { name: 'p1', OwnerId: o1!.get('id') },
          { name: 'p2', OwnerId: o1!.get('id') },
          { name: 'p3', OwnerId: o2!.get('id') },
        ],
        { returning: true },
      );
      await Pet.destroy({ where: { name: 'p2' } });
      await o2!.destroy();
      const live = await Owner.findAndCountAll({ include: [Pet], distinct: true });
      const all = await Owner.findAndCountAll({
        include: [{ model: Pet, paranoid: false }],
        paranoid: false,
        distinct: true,
      });
      const liveOwnerAllPets = await Owner.findAll({ include: [{ model: Pet, paranoid: false }] });
      return {
        liveCount: live.count,
        liveRows: live.rows.map((row) => [row.get('name'), (row.get('Pets') as unknown[]).length]),
        allCount: all.count,
        allRows: all.rows
          .map((row) => [row.get('name'), (row.get('Pets') as unknown[]).length])
          .toSorted(),
        mixed: liveOwnerAllPets.map((row) => [
          row.get('name'),
          (row.get('Pets') as unknown[]).length,
        ]),
        petCounts: [await Pet.count(), await Pet.count({ paranoid: false })],
      };
    }));

  it('a paranoid through model hides soft-deleted junction rows', () =>
    expectSameResult('', async (lib, sequelize) => {
      const User = sequelize.define('U', { name: lib.DataTypes.STRING }, { timestamps: false });
      const Customer = sequelize.define('C', { name: lib.DataTypes.STRING }, { timestamps: false });
      const Link = sequelize.define(
        'L',
        {},
        { paranoid: true, createdAt: false, updatedAt: false },
      );
      User.belongsToMany(Customer, { through: Link });
      await sequelize.sync({ force: true });
      const user = await User.create({ name: 'u' });
      const c1 = await Customer.create({ name: 'c1' });
      const c2 = await Customer.create({ name: 'c2' });
      await (user as unknown as { setCs(v: unknown[]): Promise<void> }).setCs([c1]);
      await (user as unknown as { setCs(v: unknown[]): Promise<void> }).setCs([c2]);
      const users = await User.findAll({ include: Customer });
      const customers = users[0]!.get('Cs') as Array<{ get(key: string): unknown }>;
      const links = await Link.findAll({ paranoid: false });
      return {
        customers: names(customers),
        links: links.map((link) => link.get('deletedAt') !== null).toSorted(),
      };
    }));

  it('increment, decrement and update only touch live rows unless paranoid: false', () =>
    expectSameResult('', async (lib, sequelize) => {
      const Item = sequelize.define(
        'Item',
        { name: lib.DataTypes.STRING, qty: { type: lib.DataTypes.INTEGER, defaultValue: 0 } },
        { paranoid: true },
      );
      await sequelize.sync({ force: true });
      await Item.bulkCreate([{ name: 'a' }, { name: 'b' }]);
      await Item.destroy({ where: { name: 'a' } });
      await Item.increment('qty', { by: 5, where: { name: ['a', 'b'] } });
      await Item.decrement('qty', { by: 1, where: { name: 'b' } });
      const [updated] = await Item.update({ qty: 9 }, { where: {} });
      const [updatedAll] = await Item.update({ qty: 7 }, { where: {}, paranoid: false });
      const rows = await Item.findAll({ paranoid: false, order: [['name', 'ASC']] });
      return { updated, updatedAll, rows: rows.map((row) => [row.get('name'), row.get('qty')]) };
    }));

  it('Model.restore with where, limit-free hooks and a custom deletedAt column', () =>
    expectSameResult('', async (lib, sequelize) => {
      const calls: string[] = [];
      const Doc = sequelize.define(
        'Doc',
        { name: lib.DataTypes.STRING },
        {
          paranoid: true,
          deletedAt: 'removedAt',
          hooks: {
            beforeBulkRestore: () => void calls.push('beforeBulkRestore'),
            afterBulkRestore: () => void calls.push('afterBulkRestore'),
            beforeRestore: () => void calls.push('beforeRestore'),
          },
        },
      );
      await sequelize.sync({ force: true });
      await Doc.bulkCreate([{ name: 'a' }, { name: 'b' }, { name: 'c' }]);
      await Doc.destroy({ where: {} });
      await Doc.restore({ where: { name: ['a', 'b'] } });
      const afterWhere = names(await Doc.findAll());
      await Doc.restore({ where: { name: 'c' }, individualHooks: true });
      return { afterWhere, all: names(await Doc.findAll()), calls };
    }));

  it('deletedAt with a field name and a default scope', () =>
    expectSameResult('', async (lib, sequelize) => {
      const Post = sequelize.define(
        'ScopedPost',
        {
          name: lib.DataTypes.STRING,
          published: lib.DataTypes.BOOLEAN,
          gone: { type: lib.DataTypes.DATE, field: 'gone_at' },
        },
        {
          paranoid: true,
          deletedAt: 'gone',
          defaultScope: { where: { published: true } },
          scopes: { all: {} },
        },
      );
      await sequelize.sync({ force: true });
      await Post.bulkCreate([
        { name: 'a', published: true },
        { name: 'b', published: true },
        { name: 'c', published: false },
      ]);
      await Post.destroy({ where: { name: 'a' } });
      return {
        scoped: names(await Post.findAll()),
        unscoped: names(await Post.unscoped().findAll()),
        withDeleted: names(await Post.findAll({ paranoid: false })),
        scopeAll: names(await Post.scope('all').findAll()),
      };
    }));

  it('destroy with truncate removes soft-deleted rows too; force destroy removes the row', () =>
    expectSameResult('', async (lib, sequelize) => {
      const Row = sequelize.define('TruncRow', { name: lib.DataTypes.STRING }, { paranoid: true });
      await sequelize.sync({ force: true });
      await Row.bulkCreate([{ name: 'a' }, { name: 'b' }, { name: 'c' }]);
      await Row.destroy({ where: { name: 'a' } });
      await Row.destroy({ where: { name: 'b' }, force: true });
      const afterForce = await Row.count({ paranoid: false });
      await Row.destroy({ truncate: true });
      return { afterForce, afterTruncate: await Row.count({ paranoid: false }) };
    }));

  it('force destroy cascades through onDelete CASCADE with hooks', () =>
    expectSameResult('', async (lib, sequelize) => {
      const Parent = sequelize.define('Par', { name: lib.DataTypes.STRING }, { paranoid: true });
      const Child = sequelize.define('Chi', { name: lib.DataTypes.STRING }, { paranoid: true });
      Parent.hasMany(Child, { onDelete: 'CASCADE', hooks: true });
      await sequelize.sync({ force: true });
      const parent = await Parent.create({ name: 'p' });
      await Child.create({ name: 'c', ParId: parent.get('id') });
      await parent.destroy();
      const afterSoft = await Child.count({ paranoid: false });
      await parent.destroy({ force: true });
      return { afterSoft, afterForce: await Child.count({ paranoid: false }) };
    }));

  it('the deletedAt, createdAt and updatedAt options reject values that are not a string or boolean', () =>
    expectSameResult('', async (lib, sequelize) => {
      const attempt = (options: Record<string, unknown>): string => {
        try {
          sequelize.define('Bad', { n: lib.DataTypes.INTEGER }, { timestamps: true, ...options });
          return 'ok';
        } catch (error) {
          return `${(error as Error).name}: ${(error as Error).message}`;
        }
      };
      return [
        attempt({ updatedAt: {} }),
        attempt({ createdAt: 100 }),
        attempt({ deletedAt: () => 1 }),
      ];
    }));

  it('a where array with a string is rejected with the v6 message', () =>
    expectSameResult('', async (lib, sequelize) => {
      const User = sequelize.define('ArrWhere', { name: lib.DataTypes.STRING }, { paranoid: true });
      await sequelize.sync({ force: true });
      return User.findAll({ where: ['this is a mistake', ['dont do it!']] as never }).then(
        () => 'ok',
        (error: Error) => error.message,
      );
    }));

  it('deletedAt = Infinity as default and part of the primary key: sync, create, upsert, destroy', () =>
    expectSameResult('', async (lib, sequelize) => {
      const User = sequelize.define(
        'InfUser',
        {
          name: { type: lib.DataTypes.STRING, primaryKey: true },
          address: lib.DataTypes.STRING,
          deletedAt: {
            type: lib.DataTypes.DATE,
            primaryKey: true,
            allowNull: false,
            defaultValue: Infinity as never,
          },
        },
        { paranoid: true },
      );
      await sequelize.sync({ force: true });
      await Promise.all([
        User.create({ name: 'user1' }),
        User.create({ name: 'user2', deletedAt: Infinity as never }),
      ]);
      await User.upsert({ name: 'user1', address: 'address' });
      const live = await User.findAll({ order: [['name', 'ASC']] });
      await User.destroy({ where: { name: 'user2' } });
      return {
        live: live.map((row) => [row.get('name'), row.get('address')]),
        afterDestroy: names(await User.findAll()),
        all: await User.count({ paranoid: false }),
      };
    }));
});
