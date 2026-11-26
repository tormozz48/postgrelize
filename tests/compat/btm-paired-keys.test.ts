import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

const SCHEMA = `SELECT table_name, column_name, is_nullable FROM information_schema.columns
  WHERE table_schema = current_schema() ORDER BY table_name, column_name`;
const CONSTRAINTS = `SELECT conrelid::regclass::text AS t, pg_get_constraintdef(oid) AS d FROM pg_constraint
  WHERE connamespace = current_schema()::regnamespace AND contype <> 'n' ORDER BY 1, 2`;

const properties = (association: object): unknown =>
  [
    'foreignKey',
    'otherKey',
    'sourceKey',
    'targetKey',
    'identifier',
    'foreignIdentifier',
    'identifierField',
    'foreignIdentifierField',
    'sourceKeyField',
    'targetKeyField',
  ].map((key) => (association as Record<string, unknown>)[key]);

describe('compat: paired belongsToMany', () => {
  it('takes otherKey from the foreignKey of the other side', () =>
    expectSameResult('', async (lib, sequelize) => {
      const { STRING, INTEGER } = lib.DataTypes;
      const options = { timestamps: false };
      const Student = sequelize.define('student', { name: STRING }, options);
      const Course = sequelize.define('course', { name: STRING }, options);
      const Link = sequelize.define('link', { grade: INTEGER }, options);
      const courses = Student.belongsToMany(Course, { through: Link, foreignKey: 'id_student' });
      const students = Course.belongsToMany(Student, { through: Link, foreignKey: 'id_course' });
      await sequelize.sync();
      const student = await Student.create({ name: 'a' });
      const course = await Course.create({ name: 'b' });
      const add = student as unknown as { addCourse(c: unknown): Promise<unknown> };
      await add.addCourse(course);
      const [columns] = await sequelize.query(SCHEMA);
      const [constraints] = await sequelize.query(CONSTRAINTS);
      const [rows] = await sequelize.query('SELECT * FROM links');
      return [properties(courses), properties(students), columns, constraints, rows];
    }));

  it('follows custom source keys', () =>
    expectSameResult('', async (lib, sequelize) => {
      const { STRING } = lib.DataTypes;
      const options = { timestamps: false };
      const unique = () => ({ type: STRING, allowNull: false, unique: true });
      const User = sequelize.define('user', { userSecondId: unique() }, options);
      const Group = sequelize.define('group', { groupSecondId: unique() }, options);
      const groups = User.belongsToMany(Group, {
        through: 'usergroups',
        sourceKey: 'userSecondId',
      });
      const users = Group.belongsToMany(User, {
        through: 'usergroups',
        sourceKey: 'groupSecondId',
      });
      await sequelize.sync();
      const [columns] = await sequelize.query(SCHEMA);
      const [constraints] = await sequelize.query(CONSTRAINTS);
      return [properties(groups), properties(users), columns, constraints];
    }));
});
