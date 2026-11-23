import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: VIRTUAL attributes in get() and toJSON()', () => {
  it('plain get and toJSON include getters', () =>
    expectSameResult('', async (lib) => {
      const sequelize = new lib.Sequelize('postgres://x@localhost/x', { logging: false });
      const A = sequelize.define('A', {
        sentAt: lib.DataTypes.DATE,
        expiresAt: {
          type: lib.DataTypes.VIRTUAL(lib.DataTypes.DATE, ['sentAt']),
          get(this: { getDataValue: (k: string) => unknown }) {
            return this.getDataValue('sentAt') === undefined ? null : 'soon';
          },
        },
      });
      const row = A.build({ id: 1, sentAt: new Date(0) });
      return { plain: row.get({ plain: true }), all: row.get(), json: row.toJSON() };
    }));
});

describe('compat: undefined keeps the default, validate resolves the instance', () => {
  it('build with explicit undefined', () =>
    expectSameResult('', async (lib) => {
      const sequelize = new lib.Sequelize('postgres://x@localhost/x', { logging: false });
      const M = sequelize.define('M', {
        s: { type: lib.DataTypes.STRING, defaultValue: 'x', allowNull: false },
      });
      const row = M.build({ s: undefined });
      const validated: unknown = await row.validate();
      return { s: row.get('s'), same: validated === row };
    }));
});

const TABLES = `
  CREATE TABLE "Users" (id SERIAL PRIMARY KEY);
  CREATE TABLE "Agents" (id SERIAL PRIMARY KEY, "userId" INTEGER);
  CREATE TABLE "ClientUsers" (id SERIAL PRIMARY KEY, "clientId" INTEGER, "userId" INTEGER);
  CREATE TABLE "Lines" (id SERIAL PRIMARY KEY, "docId" INTEGER);
  CREATE TABLE "Docs" (id SERIAL PRIMARY KEY);
  CREATE TABLE "Tasks" (id SERIAL PRIMARY KEY, type TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now());
  INSERT INTO "Users" DEFAULT VALUES;
  INSERT INTO "Users" DEFAULT VALUES;
  INSERT INTO "Agents" ("userId") VALUES (2);
  INSERT INTO "ClientUsers" ("clientId","userId") VALUES (1,1),(1,2);
  INSERT INTO "Docs" DEFAULT VALUES;
  INSERT INTO "Lines" ("docId") VALUES (1),(1),(1);
  INSERT INTO "Tasks" (type) VALUES ('a'),('a'),('b');
`;

describe('compat: association order, nested $a.b.c$, replacements', () => {
  it('order by an Association instance', () =>
    expectSameResult(TABLES, async (lib, sequelize) => {
      const Doc = sequelize.define('Doc', {}, { timestamps: false });
      const Line = sequelize.define('Line', {}, { timestamps: false });
      const lines = Doc.hasMany(Line, { foreignKey: 'docId', as: 'lines' });
      const found = await Doc.findAll({ include: [lines], order: [[lines, 'id', 'DESC']] });
      const doc = await Doc.findByPk(1);
      await doc!.reload({ include: [lines], order: [[lines, 'id', 'DESC']] });
      return {
        found: found.map((d) => d.toJSON()),
        reloaded: doc!.toJSON(),
        lib: Boolean(lib),
      };
    }));

  it('where $user.agent.id$', () =>
    expectSameResult(TABLES, async (lib, sequelize) => {
      const User = sequelize.define('User', {}, { timestamps: false });
      const Agent = sequelize.define('Agent', {}, { timestamps: false });
      const ClientUser = sequelize.define(
        'ClientUser',
        { clientId: lib.DataTypes.INTEGER },
        { timestamps: false },
      );
      User.hasOne(Agent, { foreignKey: 'userId', as: 'agent' });
      ClientUser.belongsTo(User, { foreignKey: 'userId', as: 'user' });
      const rows = await ClientUser.findAll({
        where: { clientId: { [lib.Op.in]: [1] }, '$user.agent.id$': null },
        include: [
          {
            association: 'user',
            required: true,
            include: [{ association: 'agent', required: false }],
          },
        ],
      });
      return rows.map((r) => r.toJSON());
    }));

  it('replacements used twice, group by matches select', () =>
    expectSameResult(TABLES, async (lib, sequelize) => {
      const { literal, fn, col } = lib;
      const Task = sequelize.define('Task', { type: lib.DataTypes.STRING }, { timestamps: false });
      const period = `to_char("createdAt" AT TIME ZONE :timeZone, 'YYYY-MM-DD')`;
      const rows = await Task.findAll({
        attributes: [[literal(period), 'period'], 'type', [fn('COUNT', col('id')), 'count']],
        group: [literal(period), 'type'],
        order: [['type', 'ASC']],
        replacements: { timeZone: 'UTC' },
        raw: true,
      });
      return (rows as unknown as { type: string; count: unknown }[]).map((r) => ({
        type: r.type,
        count: String(r.count),
      }));
    }));

  it('a number beyond int4 in a finder', () =>
    expectSameResult(TABLES, async (_lib, sequelize) => {
      const Doc = sequelize.define('Doc', {}, { timestamps: false });
      return Doc.findByPk(99999999999 as never);
    }));

  it('queryGenerator.selectQuery renders findAll options', () =>
    expectSameResult(TABLES, async (lib, sequelize) => {
      const Task = sequelize.define('Task', { type: lib.DataTypes.STRING }, { timestamps: false });
      const generator = sequelize.getQueryInterface().queryGenerator as {
        selectQuery: (table: string, options: object, model: unknown) => string;
      };
      const sql = generator.selectQuery(
        'Tasks',
        {
          attributes: ['id'],
          where: { type: { [lib.Op.in]: ['a', "it's"] }, id: { [lib.Op.gt]: 1 } },
          order: [['id', 'DESC']],
          limit: 5,
        },
        Task,
      );
      const [rows] = await sequelize.query(sql);
      return { endsWithSemicolon: sql.endsWith(';'), rows };
    }));
});

describe('compat: raw string data type', () => {
  it('syncs a column declared with a raw type name', () =>
    expectSameResult('', async (lib, sequelize) => {
      const Raw = sequelize.define(
        'Raw',
        { code: { type: 'varchar(5)' as never }, n: lib.DataTypes.INTEGER },
        { timestamps: false },
      );
      await sequelize.sync({ force: true });
      await Raw.create({ code: 'abc', n: 1 });
      const rows = (await Raw.findAll({ raw: true })) as unknown[];
      const [columns] = await sequelize.query(
        `SELECT data_type, character_maximum_length FROM information_schema.columns WHERE table_name = 'Raws' AND column_name = 'code'`,
      );
      return { rows, columns };
    }));
});
