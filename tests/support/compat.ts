import * as sequelizeV6 from 'sequelize';
import { expect } from 'vitest';
import * as postgrelize from '../../src/index.ts';
import { testDatabaseUrl } from './db-url.ts';
import { withSchema } from './with-schema.ts';

export type Lib = typeof postgrelize;

export const libraries: Readonly<Record<'sequelize' | 'postgrelize', Lib>> = {
  sequelize: sequelizeV6 as unknown as Lib,
  postgrelize,
};

export type Scenario = (lib: Lib, sequelize: postgrelize.Sequelize) => Promise<unknown>;

const isInstance = (value: object): value is { toJSON: () => unknown } =>
  'dataValues' in value && typeof (value as { toJSON?: unknown }).toJSON === 'function';

const holdsInstances = (value: unknown): boolean =>
  typeof value === 'object' &&
  value !== null &&
  (Array.isArray(value) ? value.some((item) => holdsInstances(item)) : isInstance(value));

// Included associations are read through instance properties (`user.Posts`), like application code does.
const normalizeInstance = (instance: { toJSON: () => unknown }): unknown => {
  const dataValues = (instance as unknown as { dataValues: Record<string, unknown> }).dataValues;
  const json = instance.toJSON() as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(json).map(([key, item]) => [
      key,
      normalize(
        holdsInstances(dataValues[key])
          ? (instance as unknown as Record<string, unknown>)[key]
          : item,
      ),
    ]),
  );
};

export const normalize = (value: unknown): unknown => {
  if (value instanceof Date) {
    return '<Date>';
  }
  if (value instanceof Error) {
    const fields = (value as { fields?: unknown }).fields;
    return { error: value.name, ...(fields === undefined ? {} : { fields: normalize(fields) }) };
  }
  if (Array.isArray(value)) {
    return value.map(normalize);
  }
  if (typeof value === 'object' && value !== null) {
    if (isInstance(value)) {
      return normalizeInstance(value);
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)]));
  }
  return value;
};

export const runScenario = async (
  lib: Lib,
  setupSql: string,
  scenario: Scenario,
): Promise<unknown> =>
  withSchema(async ({ schema, client }) => {
    await client.query(setupSql);
    const sequelize = new lib.Sequelize(testDatabaseUrl(), {
      logging: false,
      dialectOptions: { options: `-c search_path=${schema}` },
    });
    try {
      return normalize(await scenario(lib, sequelize).catch((error: unknown) => error));
    } finally {
      await sequelize.close();
    }
  });

/** Runs a scenario on Sequelize v6 and on postgrelize and asserts identical normalized results. */
const isNormalizedError = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && 'error' in value;

const compare = async (
  setupSql: string,
  scenario: Scenario,
  expectError: boolean,
): Promise<unknown> => {
  const expected = await runScenario(libraries.sequelize, setupSql, scenario);
  const actual = await runScenario(libraries.postgrelize, setupSql, scenario);
  expect(isNormalizedError(expected), `Sequelize v6 result: ${JSON.stringify(expected)}`).toBe(
    expectError,
  );
  expect(actual).toEqual(expected);
  return actual;
};

/** Runs a scenario on Sequelize v6 and on postgrelize and asserts identical, successful results. */
export const expectSameResult = (setupSql: string, scenario: Scenario): Promise<unknown> =>
  compare(setupSql, scenario, false);

/** Runs a scenario on both libraries and asserts both reject with the same error class and fields. */
export const expectSameError = (setupSql: string, scenario: Scenario): Promise<unknown> =>
  compare(setupSql, scenario, true);
