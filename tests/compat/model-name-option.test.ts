import { it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

type Lib = Parameters<Parameters<typeof expectSameResult>[1]>[0];

const models = (lib: Lib, sequelize: Parameters<Parameters<typeof expectSameResult>[1]>[1]) => {
  const User = sequelize.define(
    'AppUser',
    { label: lib.DataTypes.STRING },
    { name: { singular: 'user', plural: 'users' } },
  );
  const Agent = sequelize.define('AgentRecord', { label: lib.DataTypes.STRING });
  return { User, Agent };
};

const shape = (association: unknown): unknown => {
  const found = association as { as: string; foreignKey: string };
  return { as: found.as, foreignKey: found.foreignKey };
};

it('belongsTo defaults its alias and foreign key from the target `name`', () =>
  expectSameResult('', async (lib, sequelize) => {
    const { User, Agent } = models(lib, sequelize);
    const association = Agent.belongsTo(User);
    await sequelize.sync({ force: true });
    const user = await User.create({ label: 'u' });
    await Agent.create({ label: 'a', userId: user.get('id') } as never);
    const found = await Agent.findAll({ include: [User] });
    return [
      shape(association),
      found.map((row) =>
        (row as unknown as { user: { get(k: string): unknown } }).user.get('label'),
      ),
    ];
  }));

it('hasOne and hasMany default the foreign key from the source `name`', () =>
  expectSameResult('', async (lib, sequelize) => {
    const { User, Agent } = models(lib, sequelize);
    const one = User.hasOne(Agent);
    const many = User.hasMany(sequelize.define('Note', { label: lib.DataTypes.STRING }));
    await sequelize.sync({ force: true });
    return [shape(one), shape(many)];
  }));

it('belongsToMany defaults the alias and the junction keys from `name`', () =>
  expectSameResult('', async (lib, sequelize) => {
    const { User, Agent } = models(lib, sequelize);
    const association = User.belongsToMany(Agent, { through: 'user_agent' });
    const inverse = Agent.belongsToMany(User, { through: 'user_agent' });
    await sequelize.sync({ force: true });
    const row = association as unknown as { as: string; foreignKey: string; otherKey: string };
    const back = inverse as unknown as { as: string; foreignKey: string; otherKey: string };
    return [
      [row.as, row.foreignKey, row.otherKey],
      [back.as, back.foreignKey, back.otherKey],
    ];
  }));

it('a partial `name` falls back to the inflected model name for the missing form', () =>
  expectSameResult('', async (lib, sequelize) => {
    const Person = sequelize.define('Human', {}, { name: { singular: 'person' } });
    const Pet = sequelize.define('Pet', {});
    const one = Pet.belongsTo(Person);
    const many = Person.hasMany(Pet);
    return [shape(one), shape(many)];
  }));
