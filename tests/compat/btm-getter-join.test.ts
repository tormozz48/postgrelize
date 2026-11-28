import { describe, it } from 'vitest';
import type { Model } from '../../src/index.ts';
import { expectSameResult } from '../support/compat.ts';

type Source = Model & Record<string, (...args: unknown[]) => Promise<unknown>>;

describe('compat: belongsToMany getter', () => {
  it('reads targets and junction rows in one joined query', () =>
    expectSameResult('', async (lib, sequelize) => {
      const { DataTypes } = lib;
      const User = sequelize.define('User', { name: DataTypes.STRING });
      const Tag = sequelize.define('Tag', { label: DataTypes.STRING });
      const Note = sequelize.define('Note', { text: DataTypes.STRING });
      const Link = sequelize.define('Link', { weight: DataTypes.INTEGER }, { paranoid: true });
      User.belongsToMany(Tag, { through: Link });
      Tag.belongsToMany(User, { through: Link });
      Tag.hasMany(Note);
      await sequelize.sync({ force: true });
      const user = (await User.create({ name: 'u' })) as Source;
      for (const [index, label] of ['a', 'b', 'c', 'd'].entries()) {
        const tag = (await Tag.create({ label })) as Source;
        await tag['createNote']!({ text: label });
        await user['addTag']!(tag, { through: { weight: index } });
      }
      await Link.destroy({ where: { weight: 3 } });
      let statements = 0;
      const get = async (options: object) => {
        const rows = await user['getTags']!({ order: [['label', 'ASC']], ...options });
        return (rows as Model[]).map((row) => row?.toJSON?.() ?? row);
      };
      const first = await get({ logging: () => statements++ });
      return [
        statements,
        first,
        await get({ joinTableAttributes: [] }),
        await get({ joinTableAttributes: ['weight'], limit: 2 }),
        await get({ through: { where: { weight: 1 } } }),
        await get({ through: { paranoid: false }, attributes: ['label'] }),
        await get({ include: [Note], where: { label: ['a', 'b'] } }),
        await get({ include: [{ model: Note, required: false }], limit: 2 }),
        await get({ raw: true, attributes: ['label'], joinTableAttributes: ['weight'] }),
      ];
    }));
});
