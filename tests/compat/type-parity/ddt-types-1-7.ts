import {
  DataTypes,
  literal,
  Model,
  Op,
  type Attributes,
  type CreationOptional,
  type DestroyOptions,
  type FindOptions,
  type InferAttributes,
  type InferCreationAttributes,
  type ModelAttributes,
  type ModelStatic,
  type UpdateOptions,
  type WhereOptions,
} from '@orm';

// T-U: update() accepts any member of a union JSON attribute
type TextContent = { kind: 'text'; text: string; meta?: { lang: string } };
type ImageContent = { kind: 'image'; url: string; width: number; height: number };
type FileContent = TextContent | ImageContent | null;
class BkFile extends Model<InferAttributes<BkFile>, InferCreationAttributes<BkFile>> {
  declare id: CreationOptional<number>;
  declare content: FileContent;
  declare name: string | null;
}
export const tu = async (file: BkFile): Promise<void> => {
  await file.update({ content: { kind: 'text', text: 'x' } });
  await file.update({ content: { kind: 'image', url: 'u', width: 1, height: 2 } });
  await BkFile.update({ content: { kind: 'text', text: 'x' } }, { where: { id: 1 } });
  await BkFile.update({ content: null, name: literal('1') }, { where: { id: 1 } });
  const content: FileContent = file.content;
  await file.update({ content });
  await BkFile.update({ content }, { where: { id: 1 } });
  await file.set({ content });
};

// T9: get(key) with keyof
export const t9 = <M extends Model>(m: M, key: keyof M): unknown => m.get(key);
export const t9b = <M extends Model>(m: M, key: keyof M): M[keyof M] => m.get(key);
export const t9c = (m: BkFile, key: keyof BkFile): unknown => m.get(key);
export const t9d = (m: BkFile): unknown => m.get('id', { plain: true });

// T1/T4: WhereOptions with a generic type parameter
export const t1 = <M extends Model>(M: ModelStatic<M>): Promise<M[]> => {
  const where: WhereOptions<Attributes<M>> = {};
  return M.findAll({ where: { [Op.and]: [where] } });
};
export const t4 = <A extends { teamId: number }>(
  w: WhereOptions<A>,
  teamId: number,
): WhereOptions<A> => ({ [Op.and]: [w, { teamId } as WhereOptions<A>] });
export const t4b = <A extends { teamId: number }>(w: WhereOptions<A>): FindOptions<A> => ({
  where: { [Op.and]: [w] },
});
export const t4c = <T extends Model>(M: ModelStatic<T>, w: WhereOptions<Attributes<T>>) =>
  M.findAll({ where: w });
export const t4d = <T extends Model>(M: ModelStatic<T>, where: WhereOptions<T>) =>
  M.findAll({ where });

// T7: option objects are mutable and mergeable
export const t7 = (): void => {
  const find: FindOptions<{ id: number }> = {};
  find.where = { id: 1 };
  find.paranoid = false;
  const update: UpdateOptions<{ id: number }> = { where: {} };
  update.individualHooks = true;
  update.where = { id: 2 };
  const destroy: DestroyOptions<{ id: number }> = { where: {} };
  destroy.where = { id: 3 };
  destroy.individualHooks = true;
  const merged: FindOptions<{ id: number }> = { ...find, paranoid: false, where: { id: 4 } };
  const merged2: UpdateOptions<{ id: number }> = { ...update, individualHooks: false };
  void [merged, merged2];
};
export const t7b = <A extends object>(o: FindOptions<A>, w: WhereOptions<A>): FindOptions<A> => ({
  ...o,
  where: w,
  paranoid: false,
});

// T8: VIRTUAL get/set with this typed as the instance
class VirtualUser extends Model<InferAttributes<VirtualUser>> {
  declare id: number;
  declare first: string;
  declare fullName: string;
}
export const t8 = (): void => {
  VirtualUser.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true },
      first: DataTypes.STRING,
      fullName: {
        type: DataTypes.VIRTUAL,
        get(this: VirtualUser): string {
          return `${this.first}!`;
        },
        set(this: VirtualUser, value: unknown) {
          this.setDataValue('first', String(value));
        },
      },
    },
    { sequelize: undefined as never },
  );
};

// T3: operators on a nullable string column
class Email extends Model<{ id: number; source: string | null }> {}
export const t3 = async (): Promise<void> => {
  await Email.findAll({
    where: { source: { [Op.or]: [{ [Op.is]: literal('NULL') }, { [Op.ne]: 'secureEmail' }] } },
  });
  await Email.findAll({ where: { source: { [Op.is]: null } } });
  await Email.findAll({ where: { source: { [Op.or]: [{ [Op.is]: null }, { [Op.like]: 'a%' }] } } });
};

// T8b: `this` of get / set is contextually the model instance
export const t8b = (): void => {
  VirtualUser.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true },
      first: DataTypes.STRING,
      fullName: {
        type: DataTypes.VIRTUAL,
        get() {
          return `${this.first}!`;
        },
        set(value: unknown) {
          this.setDataValue('first', String(value));
        },
      },
    },
    { sequelize: undefined as never },
  );
};
export const t8c: ModelAttributes<VirtualUser, { fullName: string }> = {
  fullName: {
    type: DataTypes.VIRTUAL,
    get(): string {
      return this.first;
    },
  },
};
