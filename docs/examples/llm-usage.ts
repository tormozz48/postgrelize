// #region imports
import {
  AllowNull,
  Column,
  DataTypes,
  arrayAgg,
  arraySlice,
  grouping,
  groupingSets,
  stringAgg,
  DatabaseError,
  ForeignKey,
  HasMany,
  Model,
  Op,
  PrimaryKey,
  AutoIncrement,
  QueryTypes,
  Sequelize,
  Table,
  UniqueConstraintError,
  ValidationError,
  col,
  fn,
  literal,
} from 'postgrelize';
import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'postgrelize';
// #endregion imports

// #region connect
export const openConnection = (url: string): Sequelize =>
  new Sequelize(url, { logging: false, pool: { max: 10 } });
// call `await sequelize.authenticate()` to check it; `await sequelize.close()` on shutdown
// #endregion connect

const expectEqual = (actual: unknown, expected: unknown, what: string): void => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `llm-usage ${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
};

export const run = async (sequelize: Sequelize): Promise<void> => {
  await openConnection('postgres://user:password@localhost:5/unused').close();

  // #region define-class
  class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
    declare id: CreationOptional<number>;
    declare email: string;
    declare active: CreationOptional<boolean>;
  }

  User.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      email: { type: DataTypes.STRING, allowNull: false, unique: true },
      active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    { sequelize, tableName: 'llm_users' },
  );
  // #endregion define-class

  // #region define-fn
  const Note = sequelize.define(
    'Note',
    { text: DataTypes.TEXT, meta: DataTypes.JSONB, tags: DataTypes.ARRAY(DataTypes.TEXT) },
    { tableName: 'llm_notes', paranoid: true },
  );
  // #endregion define-fn

  // #region decorators
  @Table({ tableName: 'llm_teams' })
  class Team extends Model {
    @PrimaryKey
    @AutoIncrement
    @Column(DataTypes.INTEGER)
    id!: number;

    @AllowNull(false)
    @Column(DataTypes.TEXT)
    name!: string;

    @HasMany(() => Player)
    players?: Player[];
  }

  @Table({ tableName: 'llm_players' })
  class Player extends Model {
    @PrimaryKey
    @AutoIncrement
    @Column(DataTypes.INTEGER)
    id!: number;

    @Column(DataTypes.TEXT)
    nick!: string;

    @ForeignKey(() => Team)
    @Column(DataTypes.INTEGER)
    teamId!: number;
  }

  sequelize.addModels([Team, Player]);
  // #endregion decorators

  await sequelize.sync();

  // #region crud
  const ann = await User.create({ email: 'ann@example.com' });
  await User.bulkCreate([
    { email: 'bob@example.com' },
    { email: 'eve@example.com', active: false },
  ]);

  const byKey = await User.findByPk(ann.id);
  const one = await User.findOne({ where: { email: 'bob@example.com' } });
  const [cid, created] = await User.findOrCreate({
    where: { email: 'cid@example.com' },
    defaults: { active: true },
  });
  const all = await User.findAll({ where: { active: true }, order: [['email', 'ASC']], limit: 10 });
  const total = await User.count();

  ann.active = false; // change tracking: save() writes only changed attributes
  await ann.save();
  await ann.update({ email: 'ann@corp.example.com' });
  await ann.reload();
  await User.update({ active: true }, { where: { email: { [Op.like]: '%@example.com' } } });
  await User.destroy({ where: { id: cid.id } }); // paranoid models soft-delete; { force: true } removes
  // #endregion crud

  // #region operators
  const matches = await Note.findAll({
    where: {
      [Op.and]: [
        { text: { [Op.iLike]: '%pg%' } },
        { [Op.or]: [{ 'meta.level': 'info' }, { tags: { [Op.contains]: ['sql'] } }] },
        { id: { [Op.notIn]: [0, -1] } },
      ],
    },
  });
  // other operators: Op.eq ne gt gte lt lte between in is not like notLike regexp overlap
  // contains contained hasKey any all isDistinctFrom; compare columns with col('other')
  // PostgreSQL: Op.similarTo jsonPathExists containedOrEqual trigramSimilar; full text:
  // where(toTsVector(col('body')), Op.match, websearchToTsQuery(text)), order by tsRank()
  // #endregion operators

  await Note.bulkCreate([
    { text: 'pg tips', meta: { level: 'info' }, tags: ['sql'] },
    { text: 'misc', meta: null, tags: [] },
  ]);

  // #region query-options
  const { count, rows } = await Note.findAndCountAll({
    attributes: ['id', 'text'],
    order: [['id', 'DESC']],
    limit: 1,
    offset: 0,
    raw: true,
  });
  const perTag = await Note.findAll({
    attributes: [
      [fn('unnest', col('tags')), 'tag'],
      [fn('count', col('id')), 'n'],
    ],
    group: ['tag'],
    raw: true,
  });
  const sum = await Note.sum('id');
  await Note.destroy({ where: { text: 'misc' } }); // soft delete, the row stays with deletedAt set
  const withDeleted = await Note.findAll({ paranoid: false });
  // #endregion query-options

  // #region associations
  const team = await Team.create({ name: 'blue' });
  await Player.create({ nick: 'ace', teamId: team.id });
  const teams = await Team.findAll({
    include: [{ association: 'players', required: true, attributes: ['nick'] }],
  });
  // teams[0].players?.[0].nick === 'ace'; accessors such as team.getPlayers() are generated too
  // #endregion associations

  // #region transactions
  const placed = await sequelize.transaction(async (transaction) => {
    const user = await User.create({ email: 'tx@example.com' }, { transaction });
    await Note.create({ text: `for ${user.email}` }, { transaction });
    return user.id; // commits when the callback resolves, rolls back when it throws
  });

  const manual = await sequelize.transaction();
  try {
    await User.update({ active: false }, { where: { id: placed }, transaction: manual });
    await manual.commit();
  } catch (error) {
    await manual.rollback();
    throw error;
  }
  // #endregion transactions

  // #region hooks
  const log: string[] = [];
  User.beforeCreate((user: User) => {
    user.email = user.email.toLowerCase();
  });
  User.addHook('afterUpdate', 'log-update', (user: User) => {
    log.push(`updated ${user.id}`);
  });
  const mixed = await User.create({ email: 'MiXed@Example.com' });
  await mixed.update({ active: false });
  // #endregion hooks

  // #region upsert
  const [row] = await User.upsert({ id: ann.id, email: 'ann@corp.example.com', active: true });
  // v6 shape: [instance, null]; pass onConflict to get a real inserted/updated boolean
  const [visit, wasInserted] = await User.upsert(
    { email: 'new@example.com' },
    { onConflict: { target: ['email'], action: { update: { active: true } } } },
  );
  const written = await User.insert(
    [{ email: 'new@example.com' }, { email: 'other@example.com' }],
    { onConflict: { target: ['email'], action: 'nothing' } },
  ); // returns the rows that were actually inserted
  const [changed, updated = []] = await User.update(
    { active: false },
    { where: { email: 'new@example.com' }, returning: true },
  );
  // #endregion upsert

  // #region aggregates
  // (array_agg("User"."id" ORDER BY "User"."email" DESC))[1:3]
  const ids = arraySlice(arrayAgg<number>('id', { orderBy: [['email', 'DESC']] }), 1, 3);
  const emails = stringAgg('email', ', ', { orderBy: ['email'] }); // also jsonbAgg(); distinct: true
  const dimensions = ['active']; // may be built at run time
  const totals = await User.findAll({
    attributes: [
      ...dimensions,
      [grouping(...dimensions), 'level'],
      [ids, 'ids'],
      [emails, 'emails'],
    ],
    group: [groupingSets([dimensions, []])], // also rollup([...]), cube([...])
    raw: true,
  });
  // #endregion aggregates
  if (totals.length === 0) {
    throw new Error('Expected grouped rows');
  }

  // #region errors
  const duplicate = await User.create({ email: 'new@example.com' }).catch(
    (error: unknown) => error,
  );
  const invalid = await User.create({ email: null as unknown as string }).catch(
    (error: unknown) => error,
  );
  const bad = await sequelize
    .query('SELECT * FROM "no_such_table"')
    .catch((error: unknown) => error);
  // UniqueConstraintError and ValidationError extend ValidationError/BaseError; DatabaseError wraps
  // any other server error: `error.parent` holds the pg error with `code`, `detail`, `constraint`
  // #endregion errors

  // #region raw
  const found = (await sequelize.query('SELECT id FROM llm_users WHERE email = :email', {
    replacements: { email: 'ann@corp.example.com' },
    type: QueryTypes.SELECT,
  })) as { id: number }[];
  const ordered = await User.findAll({ order: [literal('"email" DESC NULLS LAST')] });
  // #endregion raw

  expectEqual(
    [
      byKey?.id === ann.id,
      one?.email,
      created,
      all.map((user) => user.email),
      total,
      matches.length,
    ],
    [
      true,
      'bob@example.com',
      true,
      ['ann@example.com', 'bob@example.com', 'cid@example.com'],
      4,
      0,
    ],
    'crud',
  );
  expectEqual(
    [count, rows.length, perTag, Number(sum) > 0, withDeleted.length],
    [2, 1, [{ tag: 'sql', n: '1' }], true, 2],
    'query options',
  );
  expectEqual(
    [teams[0]?.get('name'), teams[0]?.players?.[0]?.nick],
    ['blue', 'ace'],
    'associations',
  );
  expectEqual(
    [
      log.length,
      mixed.email,
      row.email,
      visit.email,
      wasInserted,
      written.length,
      changed,
      updated.length,
    ],
    [1, 'mixed@example.com', 'ann@corp.example.com', 'new@example.com', true, 1, 1, 1],
    'writes',
  );
  expectEqual(
    [
      duplicate instanceof UniqueConstraintError,
      invalid instanceof ValidationError,
      bad instanceof DatabaseError,
      found.length,
      ordered.length > 0,
    ],
    [true, true, true, 1, true],
    'errors and raw',
  );

  // #region cls
  Sequelize.useCLS(); // global switch: managed transactions now apply to queries inside the callback
  await sequelize.transaction(async () => {
    await User.update({ active: true }, { where: {} }); // runs in the transaction, no option needed
  });
  // #endregion cls
};
