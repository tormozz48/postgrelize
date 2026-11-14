import { z } from 'zod';
import { DataTypes, ValidationError, type Sequelize } from 'postgrelize';

export const run = async (sequelize: Sequelize): Promise<void> => {
  // #region hooks
  const audit: string[] = [];
  const Member = sequelize.define(
    'Member',
    {
      email: { type: DataTypes.TEXT, allowNull: false },
      role: DataTypes.TEXT,
    },
    {
      hooks: {
        beforeValidate: (member: { email: string }) => {
          member.email = member.email.trim().toLowerCase();
        },
        afterCreate: (member: { get: (key: string) => unknown }) => {
          audit.push(`created ${String(member.get('email'))}`);
        },
      },
    },
  );
  Member.beforeCreate((member: { role: string | null }) => {
    member.role ??= 'member';
  });
  Member.addHook('beforeBulkDestroy', 'log-deletes', () => {
    audit.push('bulk destroy');
  });
  // #endregion hooks

  // #region validators
  const Person = sequelize.define(
    'Person',
    {
      email: { type: DataTypes.TEXT, allowNull: false, validate: { isEmail: true } },
      name: {
        type: DataTypes.TEXT,
        validate: { len: { args: [2, 50], msg: 'name must be 2-50 characters' } },
      },
      age: {
        type: DataTypes.INTEGER,
        validate: {
          isAdult(value: unknown) {
            if (typeof value === 'number' && value < 18) {
              throw new Error('must be an adult');
            }
          },
        },
      },
    },
    {
      validate: {
        nameOrEmail(this: { name: string | null; email: string | null }) {
          if (this.name === null && this.email === null) {
            throw new Error('name or email is required');
          }
        },
      },
    },
  );
  // #endregion validators

  // #region standard-schema
  const Signup = sequelize.define(
    'Signup',
    {
      email: { type: DataTypes.TEXT, allowNull: false, validate: { schema: z.email() } },
      age: { type: DataTypes.INTEGER, validate: { schema: z.number().int().min(0) } },
      role: DataTypes.TEXT,
    },
    {
      validationSchema: z
        .object({ age: z.number().nullish(), role: z.string().nullish() })
        .refine((row) => row.role !== 'admin' || (row.age ?? 0) >= 18, {
          message: 'admins must be adults',
          path: ['role'],
        }),
    },
  );
  // #endregion standard-schema

  await sequelize.sync();

  // #region errors
  const error = await Signup.create({ email: 'nope', age: 12, role: 'admin' }).catch(
    (caught: unknown) => caught,
  );
  if (error instanceof ValidationError) {
    const paths = error.errors.map((item) => `${String(item.path)}:${String(item.validatorKey)}`);
    // paths: ['email:schema', 'role:schema']
    audit.push(...paths.toSorted());
  }
  // #endregion errors

  const member = await Member.create({ email: '  Ann@Example.COM ' });
  await Member.destroy({ where: {} });
  const personError = await Person.create({ email: 'bad', name: 'x', age: 10 }).catch(
    (caught: unknown) => caught,
  );
  const messages =
    personError instanceof ValidationError
      ? personError.errors.map((item) => item.message).toSorted()
      : [];

  const expectedAudit = ['email:schema', 'role:schema', 'created ann@example.com', 'bulk destroy'];
  if (
    JSON.stringify(audit) !== JSON.stringify(expectedAudit) ||
    member.get('role') !== 'member' ||
    JSON.stringify(messages) !==
      JSON.stringify([
        'Validation isEmail on email failed',
        'must be an adult',
        'name must be 2-50 characters',
      ])
  ) {
    throw new Error(
      `hooks-validation example: unexpected result ${JSON.stringify([audit, messages])}`,
    );
  }
};
