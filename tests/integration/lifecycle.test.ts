import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  DataTypes,
  Op,
  Sequelize,
  ValidationError,
  type SequelizeOptions,
} from '../../src/index.ts';
import { testDatabaseUrl } from '../support/db-url.ts';
import { withSchema } from '../support/with-schema.ts';

const TABLE = `
  CREATE TABLE "People" (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    age INTEGER,
    role TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL,
    "updatedAt" TIMESTAMPTZ NOT NULL
  );`;

const opened: Sequelize[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((sequelize) => sequelize.close()));
});

const connect = (schema: string, options: SequelizeOptions = {}): Sequelize => {
  const sequelize = new Sequelize(testDatabaseUrl(), {
    logging: false,
    dialectOptions: { options: `-c search_path=${schema}` },
    ...options,
  });
  opened.push(sequelize);
  return sequelize;
};

const withPeople = <T>(run: (schema: string) => Promise<T>): Promise<T> =>
  withSchema(async ({ schema, client }) => {
    await client.query(TABLE);
    return run(schema);
  });

describe('Standard Schema validation', () => {
  it('validates attributes with zod and reports issues as ValidationErrorItems', () =>
    withPeople(async (schema) => {
      const sequelize = connect(schema);
      const Person = sequelize.define(
        'Person',
        {
          email: { type: DataTypes.TEXT, allowNull: false, validate: { schema: z.email() } },
          age: { type: DataTypes.INTEGER, validate: { schema: z.number().int().min(0) } },
          role: DataTypes.TEXT,
        },
        {
          validationSchema: z
            .object({ age: z.number().nullish(), role: z.string().nullish() })
            .refine((person) => person.role !== 'admin' || (person.age ?? 0) >= 18, {
              message: 'admins must be adults',
              path: ['role'],
            }),
        },
      );
      const error = await Person.create({ email: 'nope', age: -1, role: 'admin' }).catch(
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(ValidationError);
      const items = (error as ValidationError).errors.map(({ path, validatorKey, type }) => ({
        path,
        validatorKey,
        type,
      }));
      expect(items).toEqual(
        expect.arrayContaining([
          { path: 'email', validatorKey: 'schema', type: 'Validation error' },
          { path: 'age', validatorKey: 'schema', type: 'Validation error' },
          { path: 'role', validatorKey: 'schema', type: 'Validation error' },
        ]),
      );
      await expect(
        Person.create({ email: 'a@b.io', age: 30, role: 'admin' }),
      ).resolves.toBeDefined();
    }));
});

describe('hooks', () => {
  it('runs Sequelize-level hooks after model hooks and define.hooks for every model', () =>
    withPeople(async (schema) => {
      const calls: string[] = [];
      const sequelize = connect(schema, {
        hooks: { beforeCreate: () => void calls.push('global-option') },
        define: { hooks: { afterCreate: () => void calls.push('define') } },
      });
      sequelize.addHook('beforeCreate', 'audit', () => void calls.push('global-added'));
      const Person = sequelize.define(
        'Person',
        { email: DataTypes.TEXT },
        { hooks: { beforeCreate: () => void calls.push('model') } },
      );
      await Person.create({ email: 'a@b.io' });
      expect(calls).toEqual(['model', 'global-option', 'global-added', 'define']);
      sequelize.removeHook('beforeCreate', 'audit');
      expect(sequelize.hasHook('beforeCreate')).toBe(true);
    }));

  it('lets before hooks change values and options; validationFailed sees the error', () =>
    withPeople(async (schema) => {
      const sequelize = connect(schema);
      const failures: string[] = [];
      const Person = sequelize.define('Person', {
        email: { type: DataTypes.TEXT, validate: { isEmail: true } },
        role: DataTypes.TEXT,
      });
      Person.beforeCreate((person: { role: string | null }) => {
        person.role = 'member';
      });
      Person.addHook('validationFailed', (_instance: unknown, _options: unknown, error: Error) => {
        failures.push(error.message);
      });
      Person.beforeFind((options: { where?: unknown }) => {
        options.where = { role: 'member' };
      });
      const created = await Person.create({ email: 'a@b.io' });
      expect(created.get('role')).toBe('member');
      await expect(Person.create({ email: 'bad' })).rejects.toThrow(ValidationError);
      expect(failures).toEqual(['Validation error: Validation isEmail on email failed']);
      expect(await Person.findAll()).toHaveLength(1);
    }));

  it('runs beforeConnect to supply a password', () =>
    withSchema(async ({ schema }) => {
      const url = new URL(testDatabaseUrl());
      const password = decodeURIComponent(url.password);
      url.password = 'wrong';
      const sequelize = new Sequelize(url.toString(), {
        logging: false,
        dialectOptions: { options: `-c search_path=${schema}` },
      });
      opened.push(sequelize);
      sequelize.addHook('beforeConnect', (config: { password?: string }) => {
        config.password = password;
      });
      await expect(sequelize.authenticate()).resolves.toBeUndefined();
    }));
});

describe('scopes', () => {
  it("whereMergeStrategy: 'and' combines where conditions of scopes", () =>
    withPeople(async (schema) => {
      const sequelize = connect(schema);
      const Person = sequelize.define(
        'Person',
        { email: DataTypes.TEXT, age: DataTypes.INTEGER },
        {
          whereMergeStrategy: 'and',
          scopes: {
            adults: { where: { age: { [Op.gte]: 18 } } },
            young: { where: { age: { [Op.lt]: 30 } } },
          },
        },
      );
      await Person.bulkCreate([
        { email: 'a', age: 10 },
        { email: 'b', age: 20 },
        { email: 'c', age: 40 },
      ]);
      const rows = await Person.scope('adults', 'young').findAll();
      expect(rows.map((row) => row.get('email'))).toEqual(['b']);
      expect(rows[0]).toBeInstanceOf(Person);
    }));
});
