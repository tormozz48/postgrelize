import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: references of a generated foreign key', () => {
  it('names the referenced table like v6, also for a dotted table name', () =>
    expectSameResult('', async (lib, sequelize) => {
      const User = sequelize.define('User', {});
      const Dotted = sequelize.define('Dotted', {}, { tableName: 'my.dotted' });
      const Task = sequelize.define('Task', {});
      const Tag = sequelize.define('Tag', {});
      User.hasMany(Task);
      Task.belongsTo(Dotted);
      User.belongsToMany(Tag, { through: 'UserTag' });
      await sequelize.sync({ force: true });
      await sequelize.sync({ alter: true });
      const through = sequelize.models['UserTag']!;
      return [
        Task.rawAttributes['UserId']!.references,
        Task.rawAttributes['DottedId']!.references,
        through.rawAttributes['UserId']!.references,
        await sequelize
          .getQueryInterface()
          .getForeignKeyReferencesForTable('Tasks')
          .then((keys) =>
            (keys as { referencedTableName: string }[])
              .map((key) => key.referencedTableName)
              .toSorted(),
          ),
      ];
    }));
});
