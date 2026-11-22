import { it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

it('an ENUM attribute takes its values from the `values` option', () =>
  expectSameResult('', async (lib, sequelize) => {
    const User = sequelize.define('User', {
      username: lib.DataTypes.STRING,
      mood: { type: lib.DataTypes.ENUM, values: ['happy', 'sad', 'neutral'] },
    });
    await sequelize.sync({ force: true });
    await User.create({ username: 'a', mood: 'happy' });
    const rejected = await User.create({ username: 'b', mood: 'angry' as never }).then(
      () => false,
      (error: Error) => error.name,
    );
    return {
      moods: (await User.findAll({ order: [['id', 'ASC']] })).map((row) => row.get('mood')),
      rejected,
    };
  }));
