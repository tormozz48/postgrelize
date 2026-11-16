const eq: unique symbol = Symbol.for('eq');
const ne: unique symbol = Symbol.for('ne');
const gte: unique symbol = Symbol.for('gte');
const gt: unique symbol = Symbol.for('gt');
const lte: unique symbol = Symbol.for('lte');
const lt: unique symbol = Symbol.for('lt');
const not: unique symbol = Symbol.for('not');
const is: unique symbol = Symbol.for('is');
const inOp: unique symbol = Symbol.for('in');
const notIn: unique symbol = Symbol.for('notIn');
const like: unique symbol = Symbol.for('like');
const notLike: unique symbol = Symbol.for('notLike');
const iLike: unique symbol = Symbol.for('iLike');
const notILike: unique symbol = Symbol.for('notILike');
const startsWith: unique symbol = Symbol.for('startsWith');
const endsWith: unique symbol = Symbol.for('endsWith');
const substring: unique symbol = Symbol.for('substring');
const regexp: unique symbol = Symbol.for('regexp');
const notRegexp: unique symbol = Symbol.for('notRegexp');
const iRegexp: unique symbol = Symbol.for('iRegexp');
const notIRegexp: unique symbol = Symbol.for('notIRegexp');
const between: unique symbol = Symbol.for('between');
const notBetween: unique symbol = Symbol.for('notBetween');
const overlap: unique symbol = Symbol.for('overlap');
const contains: unique symbol = Symbol.for('contains');
const contained: unique symbol = Symbol.for('contained');
const adjacent: unique symbol = Symbol.for('adjacent');
const strictLeft: unique symbol = Symbol.for('strictLeft');
const strictRight: unique symbol = Symbol.for('strictRight');
const noExtendRight: unique symbol = Symbol.for('noExtendRight');
const noExtendLeft: unique symbol = Symbol.for('noExtendLeft');
const and: unique symbol = Symbol.for('and');
const or: unique symbol = Symbol.for('or');
const any: unique symbol = Symbol.for('any');
const all: unique symbol = Symbol.for('all');
const values: unique symbol = Symbol.for('values');
const col: unique symbol = Symbol.for('col');
const placeholder: unique symbol = Symbol.for('placeholder');
const join: unique symbol = Symbol.for('join');
const match: unique symbol = Symbol.for('match');
const isDistinctFrom: unique symbol = Symbol.for('postgrelize.isDistinctFrom');
const isNotDistinctFrom: unique symbol = Symbol.for('postgrelize.isNotDistinctFrom');
const hasKey: unique symbol = Symbol.for('postgrelize.hasKey');
const hasAnyKeys: unique symbol = Symbol.for('postgrelize.hasAnyKeys');
const hasAllKeys: unique symbol = Symbol.for('postgrelize.hasAllKeys');
const similarTo: unique symbol = Symbol.for('postgrelize.similarTo');
const notSimilarTo: unique symbol = Symbol.for('postgrelize.notSimilarTo');
const jsonPathExists: unique symbol = Symbol.for('postgrelize.jsonPathExists');
const containedOrEqual: unique symbol = Symbol.for('postgrelize.containedOrEqual');
const containsOrEqual: unique symbol = Symbol.for('postgrelize.containsOrEqual');
const trigramSimilar: unique symbol = Symbol.for('postgrelize.trigramSimilar');
const trigramWordSimilar: unique symbol = Symbol.for('postgrelize.trigramWordSimilar');
const trigramStrictWordSimilar: unique symbol = Symbol.for('postgrelize.trigramStrictWordSimilar');
const trigramHasSimilarWord: unique symbol = Symbol.for('postgrelize.trigramHasSimilarWord');
const trigramHasSimilarStrictWord: unique symbol = Symbol.for(
  'postgrelize.trigramHasSimilarStrictWord',
);

/**
 * Query operators for `where` clauses.
 *
 * Symbols are created with `Symbol.for(name)` exactly like Sequelize v6, so operators imported
 * from `sequelize` and from `postgrelize` are interchangeable. Operators marked "PostgreSQL
 * extension" do not exist in Sequelize v6.
 *
 * @example
 * ```ts
 * await User.findAll({ where: { age: { [Op.gte]: 18 }, name: { [Op.iLike]: 'a%' } } });
 * ```
 */
export const Op = {
  /** `= value`; `IS NULL` when the value is `null`. */
  eq,
  /** `<> value`; `IS NOT NULL` when the value is `null`. */
  ne,
  /** `>= value`. */
  gte,
  /** `> value`. */
  gt,
  /** `<= value`. */
  lte,
  /** `< value`. */
  lt,
  /** `IS NOT value` for `null`/booleans, otherwise negates a nested condition. */
  not,
  /** `IS value`, for `null`, `true` or `false`. */
  is,
  /** `IN (...)`; long lists compile to `= ANY($n)`. */
  in: inOp,
  /** `NOT IN (...)`; long lists compile to `<> ALL($n)`. */
  notIn,
  /** `LIKE pattern`. */
  like,
  /** `NOT LIKE pattern`. */
  notLike,
  /** `ILIKE pattern`. */
  iLike,
  /** `NOT ILIKE pattern`. */
  notILike,
  /** `LIKE 'value%'`. */
  startsWith,
  /** `LIKE '%value'`. */
  endsWith,
  /** `LIKE '%value%'`. */
  substring,
  /** `~ pattern` (POSIX regular expression). */
  regexp,
  /** `!~ pattern`. */
  notRegexp,
  /** `~* pattern` (case-insensitive regular expression). */
  iRegexp,
  /** `!~* pattern`. */
  notIRegexp,
  /** `BETWEEN a AND b`, value is `[a, b]`. */
  between,
  /** `NOT BETWEEN a AND b`, value is `[a, b]`. */
  notBetween,
  /** `&&` — arrays or ranges overlap. */
  overlap,
  /** `@>` — array, range or jsonb contains the value. */
  contains,
  /** `<@` — array, range or jsonb is contained by the value. */
  contained,
  /** `-|-` — ranges are adjacent. */
  adjacent,
  /** `<<` — range is strictly left of the value. */
  strictLeft,
  /** `>>` — range is strictly right of the value. */
  strictRight,
  /** `&<` — range does not extend to the right of the value. */
  noExtendRight,
  /** `&>` — range does not extend to the left of the value. */
  noExtendLeft,
  /** Logical AND of nested conditions. */
  and,
  /** Logical OR of nested conditions. */
  or,
  /** `ANY (ARRAY[...])`, combined with a comparison operator. */
  any,
  /** `ALL (ARRAY[...])`, combined with a comparison operator. */
  all,
  /** `VALUES (...)` list for `Op.any` / `Op.all`. */
  values,
  /** Compares with another column, value is a column reference such as `'user.id'`. */
  col,
  /** Reserved by Sequelize v6 for internal use. */
  placeholder,
  /** Reserved by Sequelize v6 for internal use. */
  join,
  /** `@@` — tsvector matches tsquery. */
  match,
  /** `IS DISTINCT FROM value` (null-safe `<>`). PostgreSQL extension. */
  isDistinctFrom,
  /** `IS NOT DISTINCT FROM value` (null-safe `=`). PostgreSQL extension. */
  isNotDistinctFrom,
  /** jsonb `?` — top-level key exists. PostgreSQL extension. */
  hasKey,
  /** jsonb `?|` — any of the keys exist. PostgreSQL extension. */
  hasAnyKeys,
  /** jsonb `?&` — all of the keys exist. PostgreSQL extension. */
  hasAllKeys,
  /** `SIMILAR TO pattern` (SQL regular expression). PostgreSQL extension. */
  similarTo,
  /** `NOT SIMILAR TO pattern`. PostgreSQL extension. */
  notSimilarTo,
  /** jsonb `@?` — the jsonpath returns any item; the value is a jsonpath string. PostgreSQL extension. */
  jsonPathExists,
  /** `<<=` — inet/cidr subnet is contained within or equals the value. PostgreSQL extension. */
  containedOrEqual,
  /** `>>=` — inet/cidr subnet contains or equals the value. PostgreSQL extension. */
  containsOrEqual,
  /** `%` — `pg_trgm` trigram similarity above `pg_trgm.similarity_threshold`. PostgreSQL extension. */
  trigramSimilar,
  /** `<%` — `pg_trgm`: the column is similar to a part of the value (word similarity above the threshold). PostgreSQL extension. */
  trigramWordSimilar,
  /** `<<%` — `pg_trgm`: the column is strictly similar to a word of the value. PostgreSQL extension. */
  trigramStrictWordSimilar,
  /** `%>` — `pg_trgm`: the column has a part similar to the value (commutator of `<%`). PostgreSQL extension. */
  trigramHasSimilarWord,
  /** `%>>` — `pg_trgm`: the column has a strictly similar word of the value. PostgreSQL extension. */
  trigramHasSimilarStrictWord,
} as const;

/** Union of all operator symbols in {@link Op}. */
export type OpSymbol = (typeof Op)[keyof typeof Op];
