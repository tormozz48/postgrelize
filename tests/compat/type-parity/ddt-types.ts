import {
  DataTypes,
  literal,
  Model,
  Op,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type GroupedCountResultItem,
  type IncludeOptions,
  type Order,
  type SaveOptions,
  type Sequelize,
  type WhereOptions,
} from '@orm';

declare const sequelize: Sequelize;

// T1: a union model does not distribute
type UA = { id: number; type: 'a' | 'b'; a?: string };
type UB = { id: number; type: 'c'; b?: string };
export const t1: WhereOptions<UA | UB> = { type: ['a', 'c'] };
class UnionModel extends Model<UA | UB> {}
export const t1b = (): Promise<UnionModel[]> => UnionModel.findAll({ where: { type: ['a', 'c'] } });
export const t1c = (): Promise<[affectedCount: number]> =>
  UnionModel.update({ type: 'a' }, { where: { type: ['a', 'c'] } });

// T2: plain values for enum / narrow-union columns
enum Status {
  applied = 'applied',
  draft = 'draft',
}
enum Direction {
  in = 'in',
  out = 'out',
}
enum OtherDirection {
  in = 'in',
  out = 'out',
}
class StatusModel extends Model<{
  id: number;
  status: Status;
  jurisdiction: 'NY' | 'CA';
  direction: Direction;
}> {}
export const t2 = async (): Promise<void> => {
  const jurisdiction: string = 'NY';
  await StatusModel.findAll({ where: { status: 'applied' } });
  await StatusModel.findAll({ where: { status: ['applied', 'draft'] } });
  await StatusModel.findAll({ where: { jurisdiction } });
  await StatusModel.findAll({ where: { direction: OtherDirection.in } });
};

// T3: operators on Date | null and tuple columns
class WhenModel extends Model<{ id: number; when: Date | null }> {}
export const t3 = async (): Promise<void> => {
  await WhenModel.findAll({ where: { when: { [Op.gt]: '2026-01-01' } } });
  const dateRange = { [Op.between]: ['2026-01-01', '2026-02-01'] };
  await WhenModel.findAll({ where: { when: dateRange } });
};

// T4: generic where wrapper built with [Op.and]
export function scope<T>(where: WhereOptions<T>): WhereOptions<T> {
  return { [Op.and]: [where, literal('1=1')] };
}
type ValueAttrs = { id: number; value: string };
export const t4 = (where: WhereOptions<ValueAttrs>): WhereOptions<ValueAttrs> => ({
  ...where,
  id: 1,
});
export function applyScope<T extends { type?: string }>(
  where: WhereOptions<T>,
  types: string[],
  flag: boolean,
): WhereOptions<T> {
  return {
    [Op.and]: [
      where,
      { type: { [Op.in]: types } },
      ...(flag ? [{ type: { [Op.ne]: 'x' } }] : []),
      literal('1=1'),
    ],
  };
}

// T5: previous
class PrevModel extends Model<InferAttributes<PrevModel>, InferCreationAttributes<PrevModel>> {
  declare id: CreationOptional<number>;
  declare type: 'a' | 'b';
}
export const t5 = (m: PrevModel): { one: 'a' | 'b' | undefined; all: object } => ({
  one: m.previous('type'),
  all: m.previous(),
});

// T6: SaveOptions without a type argument assignable to SaveOptions<Attrs>
declare const helperOptions: SaveOptions;
export class SaveModel extends Model<InferAttributes<SaveModel>> {
  declare id: number;
  override save(options?: SaveOptions<InferAttributes<SaveModel>>): Promise<this> {
    return super.save(options ?? helperOptions);
  }
}

// T7: include options are mutable (hooks assign to them)
export const t7 = (options: IncludeOptions): void => {
  options.where = { id: 1 };
  options.required = true;
};
PrevModel.beforeFind((options) => {
  options.where = { id: 1 };
  options.paranoid = false;
});
PrevModel.beforeBulkUpdate((options) => {
  options.fields = ['id'];
  options.individualHooks = true;
});

// T8: typed this in get / set / validate
export class GetterModel extends Model<InferAttributes<GetterModel>> {
  declare id: number;
  declare name: string;
}
GetterModel.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true },
    name: {
      type: DataTypes.VIRTUAL(DataTypes.STRING, ['id']),
      get(this: GetterModel) {
        return `n${this.id}`;
      },
      set(this: GetterModel, val: unknown) {
        this.setDataValue('id', Number(val));
      },
    },
  },
  {
    sequelize,
    validate: {
      check(this: GetterModel) {
        if (this.id < 0) {
          throw new Error('negative');
        }
      },
    },
  },
);

// T9: string keys on get / getDataValue / changed
export const t9 = (m: PrevModel, key: string): unknown => {
  m.get(key);
  return m.get('id');
};
export const t9b = <M extends Model>(m: M, key: keyof M & string): unknown => {
  m.changed(key as never);
  return m.getDataValue(key as never);
};

// T10: raw string data type
GetterModel.init(
  { id: { type: DataTypes.INTEGER, primaryKey: true }, name: { type: 'vector(384)' } },
  { sequelize },
);

// T11: transaction keeps the contextual return type
export async function t11(): Promise<{ result: 'processed' | 'superseded' }> {
  return sequelize.transaction(async () => ({ result: 'processed' }));
}

// T12: Order, count with group, update returning, dialectModule, max
export const t12order: Order = [['id', 'ASC'], literal('1')];
export const t12count = async (): Promise<void> => {
  const grouped: GroupedCountResultItem[] = await PrevModel.count({ group: ['id'] });
  const updated: [number, PrevModel[]] = await PrevModel.update(
    { type: 'a' },
    { where: {}, returning: true },
  );
  const max: string | null = await PrevModel.max<string | null, PrevModel>('type');
  void [grouped, updated, max];
};
export const t12dialect = (dialectModule: object): Sequelize => {
  const { Sequelize: Ctor } = { Sequelize: sequelize.constructor as new (o: object) => Sequelize };
  return new Ctor({ dialect: 'postgres', dialectModule });
};
