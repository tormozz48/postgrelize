import { describe, it } from 'vitest';
import type { ModelStatic, Model, Sequelize } from '../../src/index.ts';
import { expectSameResult } from '../support/compat.ts';

const CONSTRAINTS = `
  SELECT tc.table_name, kcu.column_name, rc.delete_rule, rc.update_rule
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu USING (constraint_schema, constraint_name)
  JOIN information_schema.referential_constraints rc USING (constraint_schema, constraint_name)
  WHERE tc.constraint_schema = current_schema() AND tc.constraint_type = 'FOREIGN KEY'
  ORDER BY 1, 2`;

const describeKey = (model: ModelStatic<Model>, name: string): unknown => {
  const attribute = model.getAttributes()[name] as unknown as Record<string, unknown>;
  const references = attribute['references'] as { key?: string } | undefined;
  return [attribute['allowNull'] !== false, attribute['defaultValue'], references?.key];
};

const constraints = async (sequelize: Sequelize): Promise<unknown> =>
  sequelize.query(CONSTRAINTS, { type: 'SELECT' as never });

describe('compat: foreign key on an attribute the model already declares', () => {
  it('gets the reference and actions, keeping the declared values', () =>
    expectSameResult('', async (lib, sequelize) => {
      const { INTEGER } = lib.DataTypes;
      const User = sequelize.define('user', { uid: { type: INTEGER, primaryKey: true } });
      const Profile = sequelize.define('profile', {
        user_id: { type: INTEGER, allowNull: false },
      });
      const Task = sequelize.define('task', { projectId: { type: INTEGER, defaultValue: 42 } });
      const Project = sequelize.define('project', {});
      const Note = sequelize.define('note', { userUid: { type: INTEGER, allowNull: true } });
      Profile.belongsTo(User, { foreignKey: Profile.getAttributes()['user_id'] as never });
      Task.belongsTo(Project, { foreignKey: { allowNull: true } });
      User.hasMany(Note);
      await sequelize.sync({ force: true });
      return {
        profile: describeKey(Profile, 'user_id'),
        task: describeKey(Task, 'projectId'),
        note: describeKey(Note, 'userUid'),
        constraints: await constraints(sequelize),
      };
    }));
});
