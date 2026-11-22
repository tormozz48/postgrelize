import {
  DataTypes,
  fn,
  col,
  literal,
  Model,
  Op,
  QueryTypes,
  type HasManyGetAssociationsMixin,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
  Transaction,
  type ValidationErrorItem,
} from '@orm';

declare const sequelize: Sequelize;
declare const transaction: Transaction;

class Entry extends Model<InferAttributes<Entry>, InferCreationAttributes<Entry>> {
  declare id: number;
  declare code: string;
  declare kind: 'a' | 'b';
  declare getChildren: HasManyGetAssociationsMixin<Entry>;
}

Entry.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    code: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true,
        len: [1, 20],
        isIn: [['x', 'y']],
        custom(value: string): void {
          if (value === 'bad') {
            throw new Error('bad');
          }
        },
        async checkAsync(value: unknown): Promise<void> {
          await Promise.resolve(value);
        },
      },
    },
    kind: { type: DataTypes.ENUM('a', 'b'), defaultValue: 'a' },
  },
  {
    sequelize,
    tableName: 'entries',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['code'] },
      { fields: ['kind'], where: { kind: 'a' } },
    ],
    scopes: { kindA: { where: { kind: 'a' } }, byKind: (kind: string) => ({ where: { kind } }) },
    hooks: {
      beforeCreate: (entry: Entry, options) => {
        void [entry.code, options.transaction];
      },
    },
  },
);

Entry.hasMany(Entry, { as: 'children', foreignKey: 'parentId', onDelete: 'CASCADE' });
Entry.addHook('afterUpdate', 'audit', (entry: Entry) => {
  void entry.id;
});
Entry.beforeFind((options) => {
  options.logging = false;
});

export async function residueTwo(): Promise<void> {
  const entry = await Entry.findOne({ where: { code: 'a' } });
  if (entry === null) {
    return;
  }
  const plain = entry.get({ plain: true });
  const json = entry.toJSON();
  const changed = entry.changed('code');
  const prev = entry.previous('code');
  entry.setDataValue('code', 'x');
  entry.set({ code: 'y' });
  entry.set('kind', 'b');
  void [plain, json, changed, prev, entry.isNewRecord, entry.dataValues.code];

  await Entry.scope('kindA').findAll();
  await Entry.scope({ method: ['byKind', 'a'] }).findAll();
  await Entry.unscoped().findAll({ where: { code: { [Op.iLike]: '%a%' } } });
  await Entry.findAll({
    include: [{ association: 'children', attributes: [], required: true }],
    group: ['Entry.id'],
    having: literal('count(*) > 1'),
    subQuery: false,
  });
  await Entry.bulkCreate([{ id: 1, code: 'a', kind: 'a' }], {
    updateOnDuplicate: ['kind'],
    transaction,
  });
  await entry.getChildren({ where: { kind: 'a' }, transaction });

  const rows = await sequelize.query<{ n: number }>('select count(*) as n from entries', {
    type: QueryTypes.SELECT,
    nest: true,
    raw: true,
    transaction,
  });
  void rows[0]?.n;
  const results = await sequelize.query('delete from entries where id = :id', {
    replacements: { id: 1 },
    type: QueryTypes.DELETE,
  });
  void results;
  await sequelize.transaction(
    { isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE },
    async (t) => {
      await Entry.findAll({ transaction: t, lock: t.LOCK.UPDATE, skipLocked: true });
    },
  );
  const count = await Entry.count({ where: { kind: 'a' }, group: ['kind'] });
  void count;
  const items: ValidationErrorItem[] = [];
  void [items, fn('count', col('id'))];
  void Entry.rawAttributes.code;
  void Entry.getTableName();
  void Entry.primaryKeyAttribute;
}
