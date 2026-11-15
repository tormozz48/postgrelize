import { describe, it } from 'vitest';
import { expectSameResult, type Lib } from '../support/compat.ts';
import type { Sequelize } from '../../src/index.ts';

const SCHEMA = `
  CREATE TABLE "Users" (id SERIAL PRIMARY KEY, name TEXT, "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL);
  CREATE TABLE "Profiles" (id SERIAL PRIMARY KEY, bio TEXT, kind TEXT, "UserId" INTEGER, "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL);`;

type Accessors = Record<string, (...args: unknown[]) => Promise<unknown>>;

const defineModels = (lib: Lib, sequelize: Sequelize, scope?: Record<string, unknown>) => {
  const { DataTypes } = lib;
  const User = sequelize.define('User', { name: DataTypes.TEXT });
  const Profile = sequelize.define('Profile', { bio: DataTypes.TEXT, kind: DataTypes.TEXT });
  User.hasOne(Profile, scope === undefined ? {} : { scope });
  return { User, Profile };
};

const run = (
  scenario: (models: ReturnType<typeof defineModels>) => Promise<unknown>,
  scope?: Record<string, unknown>,
) =>
  expectSameResult(SCHEMA, async (lib, sequelize) => {
    const models = defineModels(lib, sequelize, scope);
    await models.User.bulkCreate([{ name: 'ann' }, { name: 'bob' }]);
    return scenario(models);
  });

const rows = (Profile: { findAll: (options: object) => Promise<unknown> }) =>
  Profile.findAll({ order: [['id', 'ASC']], raw: true });

describe('compat: hasOne setter', () => {
  it('links an instance and unlinks the previous one', () =>
    run(async ({ User, Profile }) => {
      const ann = (await User.findByPk(1)) as unknown as Accessors;
      const first = await Profile.create({ bio: 'first' });
      const second = await Profile.create({ bio: 'second' });
      const afterFirst = await ann['setProfile']?.(first);
      const afterSecond = await ann['setProfile']?.(second);
      return [afterFirst, afterSecond, await rows(Profile), await ann['getProfile']?.()];
    }));

  it('accepts a primary key value', () =>
    run(async ({ User, Profile }) => {
      const ann = (await User.findByPk(1)) as unknown as Accessors;
      await Profile.create({ bio: 'by key' });
      await ann['setProfile']?.(1);
      return rows(Profile);
    }));

  it('returns the same value as v6 when set by primary key', () =>
    run(async ({ User, Profile }) => {
      const ann = (await User.findByPk(1)) as unknown as Accessors;
      await Profile.create({ bio: 'by key' });
      const stub = (await ann['setProfile']?.(1)) as { id: unknown; UserId: unknown };
      return {
        id: stub.id,
        UserId: stub.UserId,
        isNew: (stub as { isNewRecord?: unknown }).isNewRecord,
      };
    }));

  it('resolves to null for an unknown primary key and unlinks the current profile', () =>
    run(async ({ User, Profile }) => {
      const ann = (await User.findByPk(1)) as unknown as Accessors;
      await ann['createProfile']?.({ bio: 'current' });
      await ann['setProfile']?.(999);
      return rows(Profile);
    }));

  it('unlinks the current profile when set to null or undefined', () =>
    run(async ({ User, Profile }) => {
      const ann = (await User.findByPk(1)) as unknown as Accessors;
      await ann['createProfile']?.({ bio: 'one' });
      const cleared = await ann['setProfile']?.(null);
      await ann['createProfile']?.({ bio: 'two' });
      const clearedAgain = await ann['setProfile']?.(undefined);
      return [cleared, clearedAgain, await rows(Profile)];
    }));

  it('keeps the link when the same profile is set again', () =>
    run(async ({ User, Profile }) => {
      const ann = (await User.findByPk(1)) as unknown as Accessors;
      const profile = (await ann['createProfile']?.({ bio: 'same' })) as object;
      await ann['setProfile']?.(profile);
      return rows(Profile);
    }));

  it('returns null like v6 when the profile is already linked', () =>
    run(async ({ User }) => {
      const ann = (await User.findByPk(1)) as unknown as Accessors;
      const profile = (await ann['createProfile']?.({ bio: 'same' })) as object;
      return ann['setProfile']?.(profile);
    }));

  it('sets the scope values on the linked instance and creates scoped profiles', () =>
    run(
      async ({ User, Profile }) => {
        const ann = (await User.findByPk(1)) as unknown as Accessors;
        const created = await ann['createProfile']?.({ bio: 'scoped' });
        const loose = await Profile.create({ bio: 'loose' });
        await ann['setProfile']?.(loose);
        return [created, await rows(Profile)];
      },
      { kind: 'main' },
    ));
});
