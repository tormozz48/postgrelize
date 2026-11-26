import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: model options of a junction created from a name', () => {
  it('applies timestamps and through.paranoid', () =>
    expectSameResult('', async (lib, sequelize) => {
      const A = sequelize.define('A', {});
      const B = sequelize.define('B', {});
      A.belongsToMany(B, { through: 'Bare', timestamps: false });
      A.belongsToMany(B, { as: 'soft', through: { model: 'Soft', paranoid: true } });
      A.belongsToMany(B, { as: 'plain', through: 'Plain' });
      await sequelize.sync({ force: true });
      return ['Bare', 'Soft', 'Plain'].map((name) =>
        Object.keys(sequelize.model(name).getAttributes()).toSorted(),
      );
    }));
});
