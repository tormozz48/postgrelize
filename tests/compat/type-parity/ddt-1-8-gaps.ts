import {
  Model,
  type Attributes,
  type CreationOptional,
  type InferAttributes,
  type ModelStatic,
  type WhereOptions,
} from '@orm';

// A: update() with a value taken from a union of attribute interfaces
interface DocBase {
  id: number;
}
interface Invoice extends DocBase {
  type: 'invoice';
  content: { a: string };
}
interface Stmt extends DocBase {
  type: 'stmt';
  content: { b: number };
}
type DocAttributes = Invoice | Stmt;
class Doc extends Model<DocAttributes, DocAttributes> {
  declare id: CreationOptional<number>;
}
export const unionUpdate = async (content: Invoice['content'] | Stmt['content'], id: number) => {
  await Doc.update({ content }, { where: { id } });
  const values: Partial<Attributes<Doc>> = { id: 1 };
  await Doc.update(values, { where: { id } });
};

// B1: changed() with keyof M, B2: get() with primaryKeyAttribute
export function changedRepro<M extends Model>(instance: M, fieldName: string) {
  return instance.changed(fieldName as keyof M);
}
export function getRepro(instance: Model, source: ModelStatic<Model>) {
  return instance.get(source.primaryKeyAttribute);
}

// C: untyped WhereOptions narrowed by assignment
export function whereRepro(search: string | undefined) {
  const where: WhereOptions = {};
  if (search) {
    where.name = search;
  }
  return where;
}
class Plain extends Model<InferAttributes<Plain>> {
  declare name: string;
}
export function whereTyped(search: string | undefined) {
  const where: WhereOptions<Attributes<Plain>> = {};
  if (search) {
    where.name = search;
  }
  return Plain.findAll({ where });
}
