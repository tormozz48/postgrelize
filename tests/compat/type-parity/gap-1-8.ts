import {
  Model,
  Op,
  literal,
  type Attributes,
  type CreationOptional,
  type FindOptions,
  type InferAttributes,
  type InferCreationAttributes,
  type ModelStatic,
  type UpdateOptions,
  type WhereOptions,
} from '@orm';

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
type Block = { type: 'p'; text: string } | { type: 'h'; level: number; text: string };
class Doc extends Model<InferAttributes<Doc>, InferCreationAttributes<Doc>> {
  declare id: CreationOptional<number>;
  declare content: Json;
  declare blocks: Block[] | null;
  declare meta: Record<string, unknown>;
  declare raw: object | null;
  declare any: unknown;
  declare tags: string[];
}

export const tuA = async (): Promise<void> => {
  await Doc.update({ content: { a: [1, 'x', null] } }, { where: { id: 1 } });
  await Doc.update({ content: [1, 2] }, { where: { id: 1 } });
  await Doc.update({ content: 'str' }, { where: { id: 1 } });
  await Doc.update({ content: null }, { where: { id: 1 } });
  await Doc.update(
    {
      blocks: [
        { type: 'p', text: 'x' },
        { type: 'h', level: 1, text: 'y' },
      ],
    },
    { where: { id: 1 } },
  );
  await Doc.update({ meta: { a: 1 }, raw: { b: 2 }, any: 5, tags: ['a'] }, { where: { id: 1 } });
  const values = { content: { a: 1 } as Json, blocks: null };
  await Doc.update(values, { where: { id: 1 } });
  const partial: Partial<Attributes<Doc>> = { content: { a: 1 } };
  await Doc.update(partial, { where: { id: 1 } });
  const [n, rows] = await Doc.update(partial, { where: { id: 1 }, returning: true });
  void [n, rows];
};
export const tuB = async (doc: Doc, p: Partial<Attributes<Doc>>): Promise<void> => {
  await doc.update({ content: { a: 1 } });
  await doc.update(p);
  await doc.update('content', { a: 1 });
  await doc.update('content', literal('x'));
  doc.set({ content: { a: 1 } });
  doc.set('content', { a: 1 });
  doc.setDataValue('content', { a: 1 });
};
export const tuC = <M extends Model>(
  M: ModelStatic<M>,
  values: Partial<Attributes<M>>,
  id: number,
) => M.update(values, { where: { id } as unknown as WhereOptions<Attributes<M>> });
export const tuD = <M extends Model>(M: ModelStatic<M>, values: Partial<Attributes<M>>) =>
  M.update(values, { where: {} });
export const tuE = <M extends Model>(
  M: ModelStatic<M>,
  values: Parameters<ModelStatic<M>['update']>[0],
) => M.update(values, { where: {} });

// T9
export const t9a = <M extends Model>(m: M, key: keyof Attributes<M>): unknown =>
  m.get(key as string);
export const t9b = <M extends Model>(m: M, key: keyof M & string): unknown => m.get(key);
export const t9c = <M extends Model>(m: M, key: string): unknown => m.get(key);
export const t9d = <M extends Model>(m: M, key: keyof M): M[keyof M] => m.get(key);
export const t9e = <M extends Model>(m: M, key: keyof Attributes<M>): unknown => m.get(key);
export const t9f = <M extends Model>(
  m: M,
  key: keyof Attributes<M>,
  v: Attributes<M>[typeof key],
) => {
  m.setDataValue(key, v);
  m.set(key, v);
  return m.getDataValue(key);
};
export const t9g = <M extends Model>(m: M, keys: (keyof M)[]) => keys.map((k) => m.get(k));
export const t9h = <M extends Model>(m: M, keys: (keyof M)[]) =>
  keys.map((k) => m.get(k as string));
export const t9i = <M extends Model>(m: M, key: keyof M) => m.get(key as keyof M & string);
export const t9j = <M extends Model>(M: ModelStatic<M>, key: keyof M & string) =>
  M.findAll({ attributes: [key] });
export const t9k = <M extends Model>(M: ModelStatic<M>, key: keyof Attributes<M>) =>
  M.findAll({
    attributes: [key as string],
    order: [[key as string, 'ASC']],
    group: [key as string],
  });

// T1/T4
type Lit = { status: 'a' | 'b'; teamId: number };
export const applyScope = <T extends { teamId: number }>(
  where: WhereOptions<T>,
  teamId: number,
): WhereOptions<T> =>
  ({
    [Op.and]: [where, { teamId }],
  }) as WhereOptions<T>;
export const t1a = <T extends Lit>(w: WhereOptions<T>): WhereOptions<T> =>
  ({ [Op.and]: [w, { teamId: 1 }] }) as WhereOptions<T>;
export const t1b = <T extends Lit>(w?: WhereOptions<T>): WhereOptions<T> => w ?? {};
export const t1c = <T extends Lit>(o: FindOptions<T>): FindOptions<T> => ({
  ...o,
  where: { [Op.and]: [o.where ?? {}, { teamId: 1 }] } as WhereOptions<T>,
});
export const t1d = <T extends Lit>(o: UpdateOptions<T>): UpdateOptions<T> => ({
  ...o,
  where: { [Op.and]: [o.where, { teamId: 1 }] } as WhereOptions<T>,
});
export const t1e = <T extends Lit>(w: WhereOptions<T>) => {
  const arr: WhereOptions<T>[] = [w];
  arr.push({ teamId: 1 } as WhereOptions<T>);
  const x: WhereOptions<T> = { [Op.or]: arr };
  return x;
};
export const t1g = (w: WhereOptions<Lit>[]): WhereOptions<Lit> => ({ [Op.and]: w });
export const t1h = (w: WhereOptions<Lit>[]): WhereOptions<Lit> => ({
  [Op.or]: [...w, { teamId: 1 }],
});
export const t1i = <T extends Lit>(w: WhereOptions<T>[]): WhereOptions<T> => ({ [Op.and]: w });
export const t1j = <T extends Model>(M: ModelStatic<T>, w: WhereOptions<Attributes<T>>[]) =>
  M.findAll({ where: { [Op.and]: w } });
export const t1k = <T extends Model>(M: ModelStatic<T>, w: WhereOptions<Attributes<T>>[]) =>
  M.findAll({ where: { [Op.or]: [{ [Op.and]: w }, literal('1')] } });
