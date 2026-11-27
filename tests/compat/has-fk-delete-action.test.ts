import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: default delete action of association foreign keys', () => {
  it('differs between belongsTo and hasOne / hasMany for a NOT NULL key', () =>
    expectSameResult('', async (lib, sequelize) => {
      const { INTEGER } = lib.DataTypes;
      const options = { timestamps: false };
      const User = sequelize.define('user', {}, options);
      const define = (name: string) => sequelize.define(name, {}, options);
      const [Many, One, Owned, Nullable] = [
        define('many'),
        define('one'),
        define('owned'),
        define('nullable'),
      ];
      const Declared = sequelize.define('declared', { userId: INTEGER }, options);
      User.hasMany(Many!, { foreignKey: { name: 'userId', allowNull: false } });
      User.hasOne(One!, { foreignKey: { name: 'userId', allowNull: false } });
      Owned!.belongsTo(User, { foreignKey: { name: 'userId', allowNull: false } });
      User.hasMany(Nullable!);
      User.hasMany(Declared);
      await sequelize.sync();
      const [constraints] = await sequelize.query(
        `SELECT conrelid::regclass::text AS t, pg_get_constraintdef(oid) AS d FROM pg_constraint
         WHERE contype = 'f' AND connamespace = current_schema()::regnamespace ORDER BY 1`,
      );
      return constraints;
    }));
});
