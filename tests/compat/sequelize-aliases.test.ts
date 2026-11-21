import { describe, it } from 'vitest';
import { expectSameResult, type Lib } from '../support/compat.ts';

const SETUP = `CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, age INTEGER);
  INSERT INTO users (name, age) VALUES ('ann', 30), ('bob', 20), ('eve', 40);`;

type Statics = Record<string, unknown>;
const asStatics = (lib: Lib): Statics => lib.Sequelize as unknown as Statics;

describe('Sequelize statics match sequelize v6', () => {
  it('exposes the data types as statics (same members as DataTypes)', () =>
    expectSameResult('', async (lib) => {
      const statics = asStatics(lib);
      const types = lib.DataTypes as unknown as Statics;
      const names = Object.keys(types).filter((name) => name in statics);
      return {
        count: names.length > 25,
        same: names.filter((name) => statics[name] !== types[name]),
        keys: [
          'STRING',
          'INTEGER',
          'BIGINT',
          'BOOLEAN',
          'DATE',
          'DATEONLY',
          'TEXT',
          'JSON',
          'JSONB',
        ]
          .concat(['UUID', 'UUIDV4', 'ENUM', 'ARRAY', 'DECIMAL', 'NOW', 'VIRTUAL', 'NUMERIC'])
          .map((name) => name in statics),
      };
    }));

  it('error statics are the thrown classes', () =>
    expectSameResult(SETUP, async (lib, sequelize) => {
      const statics = asStatics(lib) as Record<string, new (...args: never[]) => Error>;
      const User = sequelize.define(
        'User',
        { name: lib.DataTypes.STRING },
        { tableName: 'users', timestamps: false },
      );
      const error = await User.create({ name: 'ann' }).catch((e: unknown) => e);
      const missing = await User.findOne({ where: { id: 99 }, rejectOnEmpty: true }).catch(
        (e: unknown) => e,
      );
      return {
        unique: error instanceof statics['UniqueConstraintError']!,
        validation: error instanceof statics['ValidationError']!,
        base: error instanceof statics['BaseError']!,
        baseAlias: error instanceof statics['Error']!,
        empty: missing instanceof statics['EmptyResultError']!,
        names: ['QueryError', 'SequelizeScopeError', 'UnknownConstraintError', 'AccessDeniedError']
          .concat(['HostNotFoundError', 'TimeoutError', 'ConnectionError', 'EagerLoadingError'])
          .map((name) => typeof statics[name]),
      };
    }));

  it('exposes ValidationErrorItem origin and type tables', () =>
    expectSameResult('', async (lib) => {
      const statics = asStatics(lib);
      return {
        origin: statics['ValidationErrorItemOrigin'],
        type: statics['ValidationErrorItemType'],
        deferrable: ['INITIALLY_DEFERRED', 'INITIALLY_IMMEDIATE', 'NOT'].map(
          (name) => name in (statics['Deferrable'] as object),
        ),
      };
    }));

  it('Sequelize.and / or build where conditions', () =>
    expectSameResult(SETUP, async (lib, sequelize) => {
      const { Op } = lib;
      const User = sequelize.define(
        'User',
        { name: lib.DataTypes.STRING, age: lib.DataTypes.INTEGER },
        { tableName: 'users', timestamps: false },
      );
      const statics = asStatics(lib) as {
        and: (...a: unknown[]) => unknown;
        or: (...a: unknown[]) => unknown;
      };
      const rows = await User.findAll({
        where: statics.or(statics.and({ age: { [Op.gt]: 25 } }, { name: 'ann' }), {
          name: 'bob',
        }) as never,
        order: [['id', 'ASC']],
        raw: true,
      });
      return rows;
    }));

  it('has a version string', () =>
    expectSameResult(
      '',
      async (lib) => typeof (lib.Sequelize as unknown as { version: unknown }).version,
    ));
});

describe('Sequelize instance helpers match sequelize v6', () => {
  it('escape renders literals', () =>
    expectSameResult('', async (_lib, sequelize) =>
      ["O'Brien", 'plain', 42, 1.5, true, false, null].map((value) => sequelize.escape(value)),
    ));

  it('random() orders and getDatabaseName / validate work', () =>
    expectSameResult(SETUP, async (_lib, sequelize) => {
      const [rows] = (await sequelize.query(
        `SELECT name FROM users ORDER BY ${'RANDOM()'} LIMIT 1`,
      )) as unknown as [unknown[]];
      const random = sequelize.random() as unknown as { fn: string };
      await sequelize.validate();
      return {
        rows: rows.length,
        fn: random.fn.toUpperCase(),
        database: typeof sequelize.getDatabaseName(),
        queryInterface: sequelize.queryInterface === sequelize.getQueryInterface(),
        // SHOWCONSTRAINTS arrives with queryInterface.showConstraint.
        types: Object.keys(sequelize.QueryTypes)
          .filter((name) => name !== 'SHOWCONSTRAINTS')
          .toSorted(),
        helpers: [typeof sequelize.and, typeof sequelize.or, typeof sequelize.refreshTypes],
      };
    }));

  it('log passes messages to the logger', () =>
    expectSameResult('', async (_lib, sequelize) => {
      const seen: unknown[] = [];
      sequelize.log('first', 'second', { logging: (...args: unknown[]) => seen.push(args) });
      sequelize.log('quiet', { logging: false });
      return JSON.parse(
        JSON.stringify(
          seen.map((args) =>
            (args as unknown[]).map((arg) => (typeof arg === 'object' ? 'options' : arg)),
          ),
        ),
      );
    }));
});
