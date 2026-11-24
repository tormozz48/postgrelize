// Generates TypeScript that calls the public model API with the argument shapes applications write (unions,
// `null`, `Partial<Attributes<M>>`, `keyof M`, plain `string` keys, generic helpers, subclasses of a generic base).
// The same source is compiled against the Sequelize v6 declarations and against postgrelize; a statement that
// only postgrelize rejects is a type-parity bug (see tests/compat/type-generated.test.ts).

export type Statement = Readonly<{ id: number; text: string }>;

const IMPORTS = `import {
  Model,
  Op,
  literal,
  fn,
  col,
  type Attributes,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type ModelStatic,
  type WhereOptions,
  type FindOptions,
  type UpdateOptions,
} from '@orm';

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
interface DocBase { id: number }
interface Invoice extends DocBase { type: 'invoice'; content: { a: string } }
interface Stmt extends DocBase { type: 'stmt'; content: { b: number } }
type DocAttributes = Invoice | Stmt;
class Doc extends Model<DocAttributes, DocAttributes> {}
class Plain extends Model<InferAttributes<Plain>, InferCreationAttributes<Plain>> {
  declare id: CreationOptional<number>;
  declare name: string;
  declare note: string | null;
  declare meta: Json;
  declare tags: string[];
  declare status: 'a' | 'b';
}
abstract class Base<T extends {}> extends Model<T, T> {}
interface SubAttributes { id: number; label: string; parentId: number | null }
class Sub extends Base<SubAttributes> {}
`;

type Case = Readonly<{
  cls: string;
  /** Expressions (typed values) that `update` / `set` / `create` receive. */
  values: readonly string[];
  keys: readonly string[];
  where: readonly string[];
}>;

const PLAIN_WHERE = [
  '{}',
  '{ id: 1 }',
  '{ id: [1, 2] }',
  '{ id: null }',
  '{ id: { [Op.in]: [1, 2] } }',
  '{ [Op.and]: [{ id: 1 }, { id: 2 }] }',
  '{ [Op.or]: [{ id: 1 }, { id: 2 }] }',
  '{ [Op.not]: { id: 1 } }',
  "literal('1 = 1')",
  '[{ id: 1 }, { id: 2 }]',
  'wherePartial',
  'whereTyped',
  '{ [Op.and]: [whereTyped, { id: 1 }] }',
  "{ '$x.id$': 1 }",
];

const CASES: readonly Case[] = [
  {
    cls: 'Plain',
    values: [
      "{ name: 'x' }",
      '{ note: null }',
      '{ meta: { a: [1, null] } }',
      "{ tags: ['a'] }",
      "{ status: 'a' }",
      "{ name: literal('x') }",
      "{ name: fn('upper', col('name')) }",
      'partialAttrs',
      '{}',
    ],
    keys: ["'id'", "'name'", 'keyString', 'keyOfClass', 'keyOfAttributes'],
    where: PLAIN_WHERE,
  },
  {
    cls: 'Doc',
    values: ['{ content }', '{ id: 1 }', "{ type: 'stmt' }", '{ content, id: 2 }', 'partialAttrs'],
    keys: ["'id'", "'content'", 'keyString', 'keyOfAttributes'],
    where: PLAIN_WHERE,
  },
  {
    cls: 'Sub',
    values: ["{ label: 'x' }", '{ parentId: null }', 'partialAttrs'],
    keys: ["'id'", "'label'", 'keyString', 'keyOfClass', 'keyOfAttributes'],
    where: PLAIN_WHERE,
  },
];

const prelude = (cls: string): string => `
  const content = undefined as unknown as Invoice['content'] | Stmt['content'];
  const keyString = undefined as unknown as string;
  const keyOfClass = undefined as unknown as keyof ${cls};
  const keyOfAttributes = undefined as unknown as keyof Attributes<${cls}>;
  const partialAttrs = undefined as unknown as Partial<Attributes<${cls}>>;
  const wherePartial = undefined as unknown as Partial<Attributes<${cls}>>;
  const whereTyped = undefined as unknown as WhereOptions<Attributes<${cls}>>;
  const instance = undefined as unknown as ${cls};
  const cls = undefined as unknown as ModelStatic<${cls}>;
`;

const staticCalls = (c: Case): string[] => [
  ...c.where.flatMap((w) => [
    `${c.cls}.findAll({ where: ${w} })`,
    `${c.cls}.findOne({ where: ${w} })`,
    `${c.cls}.count({ where: ${w} })`,
    `${c.cls}.destroy({ where: ${w} })`,
    `cls.findAll({ where: ${w} })`,
  ]),
  ...c.values.flatMap((v) => [
    `${c.cls}.update(${v}, { where: {} })`,
    `${c.cls}.update(${v}, { where: whereTyped, returning: true })`,
    `cls.update(${v}, { where: whereTyped })`,
    `instance.update(${v})`,
    `instance.set(${v})`,
    `instance.update(${v}, { fields: [] })`,
  ]),
  `${c.cls}.findByPk(1)`,
  `${c.cls}.findAll({ attributes: [keyString], order: [[keyString, 'ASC']], group: [keyString] })`,
  `${c.cls}.findAll({ order: [[keyOfAttributes as string, 'DESC']] })`,
];

const instanceCalls = (c: Case): string[] =>
  c.keys.flatMap((k) => [
    `instance.get(${k})`,
    `instance.get(${k}, { plain: true })`,
    `instance.changed(${k})`,
    `instance.changed(${k}, true)`,
    `instance.getDataValue(${k})`,
    `instance.previous(${k})`,
    `instance.save({ fields: [${k}] })`,
  ]);

const GENERIC_HELPERS = [
  'C.update(p, { where: w })',
  'C.update(p, { where: w, returning: true })',
  'C.findAll({ where: w })',
  'C.findAll({ where: { [Op.and]: [w, {}] } as WhereOptions<Attributes<M>> })',
  'C.findAll({ attributes: [key], where: w })',
  'C.destroy({ where: w })',
  'C.count({ where: w })',
  'm.get(key)',
  'm.get(k2)',
  'm.get(ka)',
  'm.get(k2, { plain: true })',
  'm.changed(k2)',
  'm.changed(key as keyof M)',
  'm.changed(ka as keyof M)',
  'm.set(p)',
  'm.update(p)',
  'm.setDataValue(ka, m.getDataValue(ka))',
  'm.getDataValue(ka)',
  'm.save({ fields: [ka] })',
  'Object.keys(p).map((k) => m.get(k as keyof M))',
  'Object.keys(p).map((k) => m.changed(k as keyof M))',
  'C.primaryKeyAttribute && m.get(C.primaryKeyAttribute)',
  'm.get(C.primaryKeyAttribute)',
];

const genericHelper = (call: string): string =>
  `<M extends Model>(m: M, C: ModelStatic<M>, key: string, k2: keyof M, ka: keyof Attributes<M>, p: Partial<Attributes<M>>, w: WhereOptions<Attributes<M>>) => ${call}`;

const whereVariables = [
  'const w1: WhereOptions = {};\n  w1.name = "x";\n  return w1',
  'const w2: WhereOptions<Attributes<Plain>> = {};\n  w2.name = "x";\n  return w2',
  'const w3: WhereOptions = {};\n  w3[Op.and] = [{ id: 1 }];\n  return w3',
];

/**
 * Builds the source file and the list of its statements.
 *
 * @returns The source and one entry per generated statement (its id is the 1-based line number).
 */
export const generateCalls = (): Readonly<{ source: string; statements: readonly Statement[] }> => {
  const bodies: string[] = [];
  for (const c of CASES) {
    for (const call of [...staticCalls(c), ...instanceCalls(c)]) {
      bodies.push(`async () => {${prelude(c.cls)}  await ${call};\n}`);
    }
  }
  for (const call of GENERIC_HELPERS) {
    bodies.push(genericHelper(call));
  }
  for (const body of whereVariables) {
    bodies.push(`() => {\n  ${body};\n}`);
  }
  const lines = bodies.map(
    (body, index) => `export const s${index} = ${body.replaceAll('\n', ' ')};`,
  );
  const header = IMPORTS.split('\n');
  const statements = lines.map((text, index) => ({ id: header.length + index + 1, text }));
  return { source: [...header, ...lines].join('\n'), statements };
};
