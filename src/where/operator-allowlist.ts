import { Op } from '../expressions/op.ts';

const ALLOWED_CAST_TYPES: ReadonlySet<string> = new Set([
  'integer',
  'int',
  'smallint',
  'bigint',
  'float',
  'real',
  'double precision',
  'decimal',
  'numeric',
  'boolean',
  'text',
  'char',
  'varchar',
  'date',
  'timestamp',
  'timestamptz',
  'json',
  'jsonb',
  'uuid',
]);

/** Checks a `attribute::type` cast against the allowlist. */
export const validCastType = (type: string): string => {
  if (!ALLOWED_CAST_TYPES.has(type.trim().toLowerCase())) {
    throw new Error(`Invalid cast type: ${type}`);
  }
  return type;
};

const SQL_COMPARATOR =
  /^(?:[=<>!~*@&|?#+\-/%^]{1,3}|(?:NOT\s+)?(?:I?LIKE|IN|SIMILAR\s+TO)|IS(?:\s+NOT)?(?:\s+DISTINCT\s+FROM)?)$/i;

/** Checks the string comparator of `where(attr, comparator, value)` against the allowlist. */
export const validComparator = (comparator: string): string => {
  if (!SQL_COMPARATOR.test(comparator.trim()) || /--|\/\*|\*\//.test(comparator)) {
    throw new Error(`Invalid comparator: ${comparator}`);
  }
  return comparator.trim();
};

/** Operators compiled to a binary SQL operator. */
export const binaryOps: ReadonlyMap<symbol, string> = new Map<symbol, string>([
  [Op.gt, '>'],
  [Op.gte, '>='],
  [Op.lt, '<'],
  [Op.lte, '<='],
  [Op.like, 'LIKE'],
  [Op.notLike, 'NOT LIKE'],
  [Op.iLike, 'ILIKE'],
  [Op.notILike, 'NOT ILIKE'],
  [Op.regexp, '~'],
  [Op.notRegexp, '!~'],
  [Op.iRegexp, '~*'],
  [Op.notIRegexp, '!~*'],
  [Op.overlap, '&&'],
  [Op.contains, '@>'],
  [Op.contained, '<@'],
  [Op.adjacent, '-|-'],
  [Op.strictLeft, '<<'],
  [Op.strictRight, '>>'],
  [Op.noExtendRight, '&<'],
  [Op.noExtendLeft, '&>'],
  [Op.match, '@@'],
  [Op.isDistinctFrom, 'IS DISTINCT FROM'],
  [Op.isNotDistinctFrom, 'IS NOT DISTINCT FROM'],
  [Op.hasKey, '?'],
  [Op.hasAnyKeys, '?|'],
  [Op.hasAllKeys, '?&'],
]);

/** jsonb key existence operators. */
export const KEY_OPERATORS: ReadonlySet<symbol> = new Set([
  Op.hasKey,
  Op.hasAnyKeys,
  Op.hasAllKeys,
]);

/** Containment operators (jsonb when applied to a JSON path). */
export const CONTAINMENT_OPERATORS: ReadonlySet<symbol> = new Set([Op.contains, Op.contained]);

/** Families of the operators that are not plain binary SQL operators. */
export type OperatorFamily = 'equality' | 'membership' | 'pattern' | 'logical' | 'quantifier';

/** Operator family of every non-binary operator. */
export const operatorFamilies: ReadonlyMap<symbol, OperatorFamily> = new Map<
  symbol,
  OperatorFamily
>([
  [Op.eq, 'equality'],
  [Op.ne, 'equality'],
  [Op.is, 'equality'],
  [Op.not, 'equality'],
  [Op.col, 'equality'],
  [Op.in, 'membership'],
  [Op.notIn, 'membership'],
  [Op.between, 'membership'],
  [Op.notBetween, 'membership'],
  [Op.startsWith, 'pattern'],
  [Op.endsWith, 'pattern'],
  [Op.substring, 'pattern'],
  [Op.and, 'logical'],
  [Op.or, 'logical'],
  [Op.any, 'quantifier'],
  [Op.all, 'quantifier'],
]);
