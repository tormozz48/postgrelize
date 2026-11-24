import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

const TABLES = `
  CREATE TABLE "Users" (id SERIAL PRIMARY KEY);
  CREATE TABLE "Agents" (id SERIAL PRIMARY KEY, "userId" INTEGER);
  CREATE TABLE "ClientUsers" (id SERIAL PRIMARY KEY, "clientId" INTEGER, "userId" INTEGER);
  CREATE TABLE "Tasks" (id SERIAL PRIMARY KEY, a TEXT, source TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now());
  INSERT INTO "Users" DEFAULT VALUES;
  INSERT INTO "Users" DEFAULT VALUES;
  INSERT INTO "Agents" ("userId") VALUES (2);
  INSERT INTO "ClientUsers" ("clientId","userId") VALUES (1,1),(1,2);
  INSERT INTO "Tasks" (a, source) VALUES ('x', NULL),('x', 'secureEmail'),('y', 'other');
`;

describe('compat: ddt 1.7.0 runtime gaps', () => {
  it('Q: string argument of fn() is an inlined literal', () =>
    expectSameResult(TABLES, async (lib, sequelize) => {
      const Task = sequelize.define('Task', { a: lib.DataTypes.STRING }, { timestamps: false });
      return Task.findAll({
        attributes: ['a', [lib.fn('COUNT', '*'), 'n']],
        group: ['a'],
        order: [['a', 'ASC']],
        raw: true,
      });
    }));

  it('Q: fn() strings in where, group, order and having', () =>
    expectSameResult(TABLES, async (lib, sequelize) => {
      const Task = sequelize.define('Task', { a: lib.DataTypes.STRING }, { timestamps: false });
      return Task.findAll({
        attributes: [[lib.fn('concat_ws', '-', lib.col('a'), 'z'), 'k']],
        where: lib.where(lib.fn('concat_ws', ' ', lib.col('a'), 'q'), lib.Op.ne, 'x q'),
        group: [lib.fn('concat_ws', '-', lib.col('a'), 'z')],
        having: lib.where(lib.fn('concat_ws', '-', lib.col('a'), 'z'), lib.Op.ne, 'nope'),
        order: [[lib.fn('concat_ws', '-', lib.col('a'), 'z'), 'ASC']],
        raw: true,
      });
    }));

  it('R3: literal with a placeholder in attributes and group, non-raw, date_trunc', () =>
    expectSameResult(TABLES, async (lib, sequelize) => {
      const Task = sequelize.define('Task', { a: lib.DataTypes.STRING }, { timestamps: false });
      const period = `date_trunc('day', "createdAt" AT TIME ZONE :timeZone)`;
      const rows = await Task.findAll({
        attributes: [[lib.literal(period), 'period']],
        group: [lib.literal(period)],
        replacements: { timeZone: 'UTC' },
        raw: true,
      });
      return rows.length;
    }));

  it('S: Op.is with a literal', () =>
    expectSameResult(TABLES, async (lib, sequelize) => {
      const Task = sequelize.define(
        'Task',
        { source: lib.DataTypes.STRING },
        { timestamps: false },
      );
      const rows = await Task.findAll({
        where: {
          source: {
            [lib.Op.or]: [{ [lib.Op.is]: lib.literal('NULL') }, { [lib.Op.ne]: 'secureEmail' }],
          },
        },
        order: [['id', 'ASC']],
        raw: true,
      });
      return rows;
    }));

  it('T2: col() with three parts joins the path with ->', () =>
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
        where: lib.where(lib.fn('concat_ws', ' ', lib.col('user.agent.id')), lib.Op.ne, 'x'),
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
});
