import { describe, it } from 'vitest';
import { expectSameResult, type Lib } from '../support/compat.ts';
import type { Sequelize } from '../../src/index.ts';

const SCHEMA = `
  CREATE TABLE "Users" (id SERIAL PRIMARY KEY, name TEXT, "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL);
  CREATE TABLE "Groups" (id SERIAL PRIMARY KEY, label TEXT, "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL);
  CREATE TABLE "Memberships" (id SERIAL PRIMARY KEY, role TEXT, "UserId" INTEGER NOT NULL, "GroupId" INTEGER NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL);`;

const defineModels = (lib: Lib, sequelize: Sequelize) => {
  const { DataTypes } = lib;
  const User = sequelize.define('User', { name: DataTypes.TEXT });
  const Group = sequelize.define('Group', { label: DataTypes.TEXT });
  const Membership = sequelize.define('Membership', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    role: DataTypes.TEXT,
  });
  User.belongsToMany(Group, { through: Membership });
  Group.belongsToMany(User, { through: Membership });
  return { User, Group, Membership };
};

const run = (through: Record<string, unknown>, nested = false) =>
  expectSameResult(SCHEMA, async (lib, sequelize) => {
    const { User, Group, Membership } = defineModels(lib, sequelize);
    await User.bulkCreate([{ name: 'ann' }]);
    await Group.bulkCreate([{ label: 'g1' }, { label: 'g2' }]);
    await Membership.bulkCreate([
      { UserId: 1, GroupId: 1, role: 'owner' },
      { UserId: 1, GroupId: 2, role: 'guest' },
    ]);
    // v6 mutates a shared `through` object (it adds the primary key), so each level gets a copy.
    const level = () => ({ model: Group, through: { ...through } });
    return nested
      ? Group.findAll({
          include: [{ model: User, through: { ...through }, include: [level()] }],
          order: [['id', 'ASC']],
        })
      : User.findAll({ include: [level()], order: [['id', 'ASC']] });
  });

describe('compat: nested through attributes', () => {
  it('selects only the listed junction columns', () => run({ attributes: ['role'] }));

  it('selects only the listed junction columns in a nested include', () =>
    run({ attributes: ['role'] }, true));

  it('selects no junction columns for an empty list', () => run({ attributes: [] }));
});
