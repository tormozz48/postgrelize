/* oxlint-disable typescript/no-explicit-any, import/namespace */
// `any` is the v6 default of `WhereOptions`; the `Model` namespace member is resolved by the compiler, not by the linter.
// For key public types, a list of sample values is checked against the v6 type and against the postgrelize
// type. Every sample that v6 accepts must be accepted by postgrelize; a miss makes a `Check` below a compile
// error that lists the indexes of the samples (postgrelize may accept more than v6).
import * as V6 from '@v6';
import * as PG from '@orm';

type V6Literal = ReturnType<typeof V6.literal>;

// Every sample that v6 accepts must be accepted by postgrelize (it may accept more: a v6 program has to compile).
type Missed<V6Answers extends readonly boolean[], PGAnswers extends readonly boolean[]> = {
  [I in keyof V6Answers]: V6Answers[I] extends true
    ? PGAnswers[I & keyof PGAnswers] extends true
      ? never
      : I
    : never;
}[number];
type Assert<T extends never> = T;
type Results<P, Samples extends readonly unknown[]> = {
  [I in keyof Samples]: [Samples[I]] extends [P] ? true : false;
};

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
interface PlainAttributes {
  id: number;
  name: string;
  note: string | null;
  meta: Record<string, unknown>;
  tags: string[];
  status: 'a' | 'b';
  when?: Date;
}
type UnionAttributes = Invoice | Stmt;
type Content = Invoice['content'] | Stmt['content'];

// `Attrs` is the attribute set, `Lit` the library's own `literal()` result, `And` / `Or` its operator keys.
type WhereSamples<Attrs, And extends symbol, Or extends symbol, Lit> = [
  {},
  { id: 1 },
  { id: [1, 2] },
  { id: null },
  { id: 'x' },
  { id: true },
  { nope: 1 },
  { id: 1; nope: 1 },
  { name: 'x'; id: 1 },
  { name: ['a', 'b'] },
  { note: null },
  { meta: { a: 1 } },
  { tags: ['a'] },
  { status: 'a' },
  { status: 'c' },
  { content: { a: 'x' } },
  { content: { b: 1 } },
  { type: 'stmt' },
  { '$x.id$': 1 },
  { 'meta.a': 1 },
  { 'id::text': '1' },
  { [K in And]: [{ id: 1 }, { name: 'x' }] },
  { [K in Or]: { id: 1 } },
  { [K in And]: {} },
  { [K in And]: [Partial<Attrs>] },
  { [K in And]: [{ id: 1 }] } & { id: 2 },
  [{ id: 1 }, { id: 2 }],
  [],
  [1],
  Lit,
  Partial<Attrs>,
  Attrs,
  string,
  number,
  null,
  undefined,
  object,
  Date,
  { id: Lit },
];

type UpdateSamples<Lit> = [
  {},
  { id: 1 },
  { id: null },
  { id: 'x' },
  { nope: 1 },
  { name: 'x' },
  { name: null },
  { name: Lit },
  { note: null },
  { meta: { a: [1, null] } },
  { tags: ['a'] },
  { tags: [1] },
  { status: 'a' },
  { status: 'c' },
  { content: Content },
  { content: { a: 'x' } },
  { content: { b: 1 } },
  { content: { c: 1 } },
  { content: Content; id: 2 },
  { type: 'stmt' },
  { type: 'other' },
  { content: Lit },
  { when: Date },
  { when: undefined },
  { when: null },
  Partial<PlainAttributes>,
  Partial<UnionAttributes>,
];

class V6Doc<A extends {}> extends V6.Model<A, A> {}
class PGDoc<A extends {}> extends PG.Model<A, A> {}
// the `values` parameter of the non-returning `update` overload, read from the real class
type V6Update<A extends {}> = Parameters<typeof V6.Model.update<V6Doc<A>>>[0];
type PGUpdate<A extends {}> = Parameters<typeof PG.Model.update<PGDoc<A>>>[0];

type V6Where<A> = V6.WhereOptions<A>;
type PGWhere<A> = PG.WhereOptions<A>;

type V6WhereSamples<A> = WhereSamples<A, typeof V6.Op.and, typeof V6.Op.or, V6Literal>;
type PGWhereSamples<A> = WhereSamples<A, typeof PG.Op.and, typeof PG.Op.or, PG.Literal>;

export type Check0 = Assert<
  Missed<
    Results<V6Where<PlainAttributes>, V6WhereSamples<PlainAttributes>>,
    Results<PGWhere<PlainAttributes>, PGWhereSamples<PlainAttributes>>
  >
>;
export type Check1 = Assert<
  Missed<
    Results<V6Where<UnionAttributes>, V6WhereSamples<UnionAttributes>>,
    Results<PGWhere<UnionAttributes>, PGWhereSamples<UnionAttributes>>
  >
>;
export type Check2 = Assert<
  Missed<Results<V6Where<any>, V6WhereSamples<any>>, Results<PGWhere<any>, PGWhereSamples<any>>>
>;
export type Check3 = Assert<
  Missed<
    Results<V6Update<PlainAttributes>, UpdateSamples<V6Literal>>,
    Results<PGUpdate<PlainAttributes>, UpdateSamples<PG.Literal>>
  >
>;
export type Check4 = Assert<
  Missed<
    Results<V6Update<UnionAttributes>, UpdateSamples<V6Literal>>,
    Results<PGUpdate<UnionAttributes>, UpdateSamples<PG.Literal>>
  >
>;
