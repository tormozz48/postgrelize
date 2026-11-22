import {
  DataTypes,
  DatabaseError,
  EmptyResultError,
  ForeignKeyConstraintError,
  OptimisticLockError,
  TimeoutError,
  UniqueConstraintError,
  ValidationError,
  type Sequelize,
} from 'postgrelize';

export const run = async (sequelize: Sequelize): Promise<void> => {
  const Author = sequelize.define(
    'Author',
    {
      email: { type: DataTypes.TEXT, allowNull: false, unique: true },
      name: { type: DataTypes.TEXT, validate: { len: [2, 40] } },
    },
    { timestamps: false },
  );
  const Book = sequelize.define(
    'Book',
    {
      title: DataTypes.TEXT,
      authorId: { type: DataTypes.INTEGER, references: { model: 'Authors', key: 'id' } },
    },
    { timestamps: false },
  );
  const Ticket = sequelize.define(
    'Ticket',
    { subject: DataTypes.TEXT },
    { timestamps: false, version: true },
  );
  await sequelize.sync();
  await Author.create({ email: 'ann@example.com', name: 'Ann' });

  // #region unique
  try {
    await Author.create({ email: 'ann@example.com', name: 'Ann again' });
  } catch (error) {
    if (!(error instanceof UniqueConstraintError)) throw error;
    // error.fields: { email: 'ann@example.com' }
    // error.errors[0].type === 'unique violation', error.errors[0].path === 'email'
    // error.parent.code === '23505': the original pg error
    if (error.fields.email !== 'ann@example.com')
      throw new Error('unexpected fields', { cause: error });
  }
  // #endregion unique

  // #region foreign-key
  try {
    await Book.create({ title: 'Orphan', authorId: 999 });
  } catch (error) {
    if (!(error instanceof ForeignKeyConstraintError)) throw error;
    // error.table === 'Authors', error.index is the constraint name, error.fields lists the columns
    if (error.parent.code !== '23503') throw new Error('unexpected code', { cause: error });
  }
  // #endregion foreign-key

  // #region validation
  try {
    await Author.create({ email: 'bob@example.com', name: 'B' });
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    for (const item of error.errors) {
      // item.path === 'name', item.type === 'Validation error', item.message, item.value === 'B'
      if (item.path !== 'name') throw new Error('unexpected path', { cause: error });
    }
  }
  // #endregion validation

  // #region not-found
  const missing = await Author.findOne({
    where: { email: 'nobody@example.com' },
    rejectOnEmpty: true,
  })
    .then(() => null)
    .catch((error: unknown) => error);
  if (!(missing instanceof EmptyResultError)) throw new Error('expected EmptyResultError');
  // #endregion not-found

  // #region optimistic-lock
  const ticket = await Ticket.create({ subject: 'printer' });
  const sameTicket = await Ticket.findByPk(ticket.get('id') as number);
  await ticket.update({ subject: 'printer on fire' });
  const stale = await sameTicket!.update({ subject: 'paper jam' }).catch((error: unknown) => error);
  if (!(stale instanceof OptimisticLockError)) throw new Error('expected OptimisticLockError');
  // #endregion optimistic-lock

  // #region timeout
  const slow = await sequelize
    .query('SELECT pg_sleep(5)', { statementTimeout: 50 })
    .catch((error: unknown) => error);
  if (!(slow instanceof TimeoutError)) throw new Error('expected TimeoutError');
  // TimeoutError extends DatabaseError, so a generic handler still catches it
  if (!(slow instanceof DatabaseError)) throw new Error('TimeoutError is a DatabaseError');
  // #endregion timeout

  // #region database-error
  const bad = await sequelize.query('SELECT 1 / 0').catch((error: unknown) => error);
  if (!(bad instanceof DatabaseError)) throw new Error('expected DatabaseError');
  // bad.parent.code === '22012' (division_by_zero), bad.sql is the statement that failed
  if (bad.parent.code !== '22012') throw new Error('unexpected code');
  // #endregion database-error
};
