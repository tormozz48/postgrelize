import {
  DataTypes,
  fn,
  col,
  literal,
  LOCK,
  Model,
  Op,
  type BelongsTo,
  type BelongsToGetAssociationMixin,
  type CreationOptional,
  type ForeignKey,
  type InferAttributes,
  type InferCreationAttributes,
  type InitOptions,
  type ModelStatic,
  type NonAttribute,
  type QueryInterface,
  type SaveOptions,
  type Sequelize,
  type Transaction,
  type WhereOptions,
  ForeignKeyConstraintError,
} from '@orm';

declare const sequelize: Sequelize;
declare const queryInterface: QueryInterface;

type DocumentType = 'invoice' | 'receipt' | 'credit' | 'other';
type Narrow = 'invoice' | 'receipt';

class Doc extends Model<InferAttributes<Doc>, InferCreationAttributes<Doc>> {
  declare id: CreationOptional<number>;
  declare type: DocumentType;
  declare status: 'open' | 'closed';
  declare grossAmount: number;
  declare amountExpression: string | null;
  declare assigneeAgentId: number | null;
  declare ownerId: ForeignKey<number | null>;
  declare getOwner: BelongsToGetAssociationMixin<Doc>;
  declare owner?: NonAttribute<Doc>;

  override async save(options?: SaveOptions<InferAttributes<Doc>>): Promise<this> {
    return super.save(options);
  }
}

Doc.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    type: { type: DataTypes.STRING, allowNull: false },
    status: { type: DataTypes.STRING, allowNull: false },
    grossAmount: { type: DataTypes.DECIMAL, allowNull: false },
    amountExpression: DataTypes.STRING,
    assigneeAgentId: DataTypes.INTEGER,
    ownerId: DataTypes.INTEGER,
  },
  { sequelize, tableName: 'docs', name: { singular: 'doc', plural: 'docs' } },
);

// 1. WhereOptions shapes
const types: DocumentType[] = ['invoice', 'receipt'];
const wideColumn: WhereOptions<{ type: DocumentType; status: 'open' | 'closed' }> = {
  type: types,
  status: 'open',
};
const inOp: WhereOptions<{ type: DocumentType }> = { type: { [Op.in]: types } };
const expression: WhereOptions<Doc> = { amountExpression: '$grossAmount' };
const mixed: WhereOptions<Doc> = {
  [Op.and]: [{ type: 'invoice' }, { status: 'open' }, literal('1 = 1'), { [Op.or]: [{ id: 1 }] }],
};
const nested: WhereOptions = { '$owner.id$': 1, '$owner.type$': { [Op.in]: types } };
const loose: WhereOptions<{ assigneeAgentId: number }> = { assigneeAgentId: 1 };
const optionalValue = (value?: unknown): WhereOptions<Doc> => ({ id: value as number });
const hashLike: { assigneeAgentId: number } = { assigneeAgentId: 2 };

const onModel = async (
  where: { assigneeAgentId: number },
  kinds: Narrow[],
  wide: DocumentType[],
  status: string,
): Promise<void> => {
  await Doc.findAll({ where: { type: kinds } });
  await Doc.findAll({ where: { type: wide, status: 'open' } });
  await Doc.findAll({ where: { type: { [Op.in]: kinds } } });
  await Doc.findAll({ where: { type: { [Op.in]: wide }, ...where } });
  await Doc.findAll({ where: { type: 'invoice', amountExpression: '$grossAmount' } });
  await Doc.findAll({ where: where });
  await Doc.findAll({ where: { [Op.and]: [where, { type: kinds }] } });
  await Doc.findAll({ where: { [Op.or]: [{ type: 'invoice' }, where] } });
  await Doc.findAll({ where: { '$owner.type$': 'invoice' } });
  await Doc.findAll({ where: { status: { [Op.in]: [status as never] } } });
  await Doc.count({ where: { type: wide } });
  await Doc.destroy({ where: { type: wide } });
  await Doc.update({ status: 'closed' }, { where: { type: wide, ...where } });
};

interface InvoiceAttributes {
  id: number;
  kind: DocumentType;
  state: 'draft' | 'sent' | null;
  issuedAt: Date | null;
  tags: string[] | null;
  meta: { a: number } | null;
}
class Invoice extends Model<InvoiceAttributes, Omit<InvoiceAttributes, 'id'>> {
  declare id: number;
  declare kind: DocumentType;
}
const whereKinds = (kinds: readonly DocumentType[]): WhereOptions<InvoiceAttributes> => ({
  kind: [...kinds],
  state: { [Op.ne]: null },
  issuedAt: { [Op.gte]: new Date(), [Op.lt]: new Date() },
});
const composed = (extra: WhereOptions<InvoiceAttributes>): WhereOptions<InvoiceAttributes> => ({
  [Op.and]: [
    extra,
    { kind: { [Op.notIn]: ['other'] } },
    { state: null },
    { tags: { [Op.contains]: ['a'] } },
  ],
});
const spread = (base: WhereOptions<InvoiceAttributes>): Promise<Invoice[]> =>
  Invoice.findAll({ where: { ...(base as object), id: { [Op.in]: [1, 2] } } });
const state = (value: string): WhereOptions<InvoiceAttributes> => ({ state: value as 'draft' });
const generic = <T extends DocumentType>(kind: T): Promise<Invoice[]> =>
  Invoice.findAll({ where: { kind, state: 'sent' } });

// 2. Fn | Col | Literal as attribute values
const writes = async (): Promise<void> => {
  await Doc.update(
    { grossAmount: fn('abs', col('grossAmount')), status: literal("'closed'") as never },
    { where: { id: 1 } },
  );
  await Doc.create({ type: 'invoice', status: 'open', grossAmount: literal('1') as never });
  await Doc.findAll({ where: { grossAmount: fn('abs', 1) } });
  await Doc.findAll({ where: { grossAmount: col('other') } });
  await Doc.findAll({ where: { grossAmount: literal('1') } });
  await Doc.update({ grossAmount: col('grossAmount') as never }, { where: { grossAmount: 1 } });
};

// 3. this typing in validators, getters and setters
class Typed extends Model<InferAttributes<Typed>, InferCreationAttributes<Typed>> {
  declare id: CreationOptional<number>;
  declare first: string;
  declare full: CreationOptional<string>;
}
Typed.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true },
    first: {
      type: DataTypes.STRING,
      get(this: Typed): string {
        return String(this.getDataValue('first')).trim();
      },
      set(this: Typed, value: string): void {
        this.setDataValue('first', value.trim());
      },
    },
    full: {
      type: DataTypes.VIRTUAL,
      get(this: Typed): string {
        return `${this.getDataValue('first')}!`;
      },
    },
  },
  {
    sequelize,
    validate: {
      checks(this: Typed): void {
        if (this.getDataValue('first') === 'x') throw new Error('x');
      },
    },
  },
);

// 4. Model#get overloads
const read = (doc: Doc): number => {
  const byKey: DocumentType = doc.get('type');
  const id: number = doc.get('id');
  const plain: InferAttributes<Doc> = doc.get({ plain: true });
  const free: unknown = doc.get('whatever' as string);
  const all = doc.get();
  void [byKey, plain, free, all];
  return id;
};

// 5. association hooks and include `on`
Doc.belongsTo(Doc, { as: 'owner', foreignKey: 'ownerId', hooks: true });
Doc.hasMany(Doc, { as: 'children', foreignKey: 'ownerId', hooks: true });
Doc.hasOne(Doc, { as: 'single', foreignKey: 'ownerId', hooks: true });
const includeOn = (): Promise<Doc[]> =>
  Doc.findAll({
    include: [{ model: Doc, as: 'children', on: { ownerId: col('Doc.id') }, required: false }],
  });

// 6. queryGenerator
const generator: unknown = queryInterface.queryGenerator;

// 7. hook options are assignable
Doc.addHook('beforeFind', (options) => {
  options.where = { id: 1 };
  options.paranoid = false;
  options.attributes = ['id'];
});
Doc.beforeBulkUpdate((options) => {
  options.individualHooks = true;
  options.fields = ['status'];
  options.where = { id: 1 };
});
Doc.beforeCount((options) => {
  options.where = { id: 1 };
  options.paranoid = false;
});

// 8. LOCK as value and type
const lockValue = LOCK.UPDATE;
const lockType: LOCK = LOCK.SHARE;
const withLock = (transaction: Transaction): Promise<Doc | null> =>
  Doc.findOne({ lock: transaction.LOCK.UPDATE, transaction });

// 9. findAndCountAll / update results
const counts = async (): Promise<void> => {
  const { count, rows } = await Doc.findAndCountAll({ where: { id: 1 } });
  const total: number = count;
  const grouped = await Doc.findAndCountAll({ group: ['status'] });
  const entries: { count: number }[] = grouped.count;
  const [affected] = await Doc.update({ status: 'closed' }, { where: { id: 1 } });
  const result: [affectedCount: number, affectedRows?: Doc[]] = await Doc.update(
    { status: 'closed' },
    { where: { id: 1 }, returning: true },
  );
  void [rows, total, entries, affected, result];
};

// 10b. more residue: validate with and without `this`, string data types, association generics
class Checked extends Model<InferAttributes<Checked>, InferCreationAttributes<Checked>> {
  declare id: CreationOptional<number>;
  declare code: string;
  declare other: string | null;
}
Checked.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true },
    code: {
      type: DataTypes.STRING,
      validate: {
        sameAsOther(this: Checked, value: string): void {
          if (this.getDataValue('other') === value) throw new Error('same');
          if (this.get('other') === value) throw new Error('same');
        },
      },
    },
    other: DataTypes.STRING,
  },
  {
    sequelize,
    validate: {
      both(this: Checked): void {
        if (this.code === this.getDataValue('other')) throw new Error('same');
      },
    },
  },
);
class Loose extends Model<InferAttributes<Loose>, InferCreationAttributes<Loose>> {
  declare id: CreationOptional<number>;
  declare a: string;
  declare b: string | null;
}
Loose.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true },
    a: {
      type: DataTypes.STRING,
      get(): string {
        return this.getDataValue('a');
      },
      set(value: string): void {
        this.setDataValue('a', value.trim());
      },
      validate: {
        mustDiffer(this: Loose, value: unknown): void {
          if (this.getDataValue('b') === value) throw new Error('same');
        },
      },
    },
    b: DataTypes.STRING,
  },
  {
    sequelize,
    validate: {
      bothOrNone(this: Loose): void {
        if ((this.getDataValue('a') === null) !== (this.getDataValue('b') === null)) {
          throw new Error('both or none');
        }
      },
    },
  },
);
const assoc: BelongsTo<Doc, Doc> = Doc.belongsTo(Doc, { foreignKey: 'ownerId' });
const keys: (keyof InferAttributes<Doc>)[] = ['id', 'status'];
const byKeys = (): Promise<Doc[]> => Doc.findAll({ attributes: keys });
const upd = (): Promise<Doc[]> =>
  Doc.bulkCreate([{ type: 'invoice', status: 'open', grossAmount: 1 }], {
    updateOnDuplicate: keys,
  });

// 10. misc
const log = (): Promise<unknown> =>
  sequelize.query('select 1', {
    logging: (sql: string, timing?: number): void => {
      void [sql, timing];
    },
  });
const constraint = new ForeignKeyConstraintError({ message: 'm', table: 't' });
void constraint;
const initOptions: InitOptions = { sequelize };
const aStatic: ModelStatic<Doc> = Doc;
const byKey = (key: keyof Doc): Promise<unknown> => Doc.findAll({ attributes: [key as string] });
const bulk = (): Promise<Doc[]> =>
  Doc.bulkCreate([{ type: 'invoice', status: 'open', grossAmount: 1 }], {
    updateOnDuplicate: ['status'],
  });

export {
  wideColumn,
  inOp,
  expression,
  mixed,
  nested,
  loose,
  optionalValue,
  hashLike,
  writes,
  read,
  includeOn,
  generator,
  lockValue,
  lockType,
  withLock,
  counts,
  log,
  initOptions,
  assoc,
  byKeys,
  upd,
  whereKinds,
  composed,
  spread,
  state,
  generic,
  onModel,
  aStatic,
  byKey,
  bulk,
};

type UnionA = { id: number; type: 'a' | 'b'; a?: string };
type UnionB = { id: number; type: 'c'; b?: string };
export const whereOverUnionModel: WhereOptions<UnionA | UnionB> = { type: ['a', 'c'] };
