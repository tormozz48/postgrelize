import { Cast, Fn } from './call-expressions.ts';
import { Literal } from './methods.ts';

const CONFIG_NAME = /^[A-Za-z_][\w$]*(?:\.[A-Za-z_][\w$]*)?$/;
const WEIGHTS: ReadonlySet<string> = new Set(['A', 'B', 'C', 'D']);
const MAX_NORMALIZATION = 63;

/**
 * Options of {@link tsRank}. PostgreSQL extension.
 *
 * @postgrelize
 * @example
 * ```ts
 * const options: TsRankOptions = { cd: true, weights: [0.1, 0.2, 0.4, 1], normalization: 1 };
 * ```
 */
export type TsRankOptions = Readonly<{
  /** Uses `ts_rank_cd` (cover density) instead of `ts_rank`. */
  cd?: boolean;
  /** Weights of the labels `D`, `C`, `B`, `A`, in this order. */
  weights?: readonly [number, number, number, number];
  /** Normalization bit mask, an integer from 0 to 63. */
  normalization?: number;
}>;

/**
 * Options of {@link tsHeadline}. PostgreSQL extension.
 *
 * @postgrelize
 * @example
 * ```ts
 * const options: TsHeadlineOptions = { config: 'english', options: 'StartSel=<b>, StopSel=</b>' };
 * ```
 */
export type TsHeadlineOptions = Readonly<{
  /** Text search configuration, e.g. `'english'`. */
  config?: string;
  /** `ts_headline` options string, e.g. `'StartSel=<b>, StopSel=</b>'`. Bound as a parameter. */
  options?: string;
}>;

const regconfig = (config: string): Cast => {
  if (typeof config !== 'string' || !CONFIG_NAME.test(config)) {
    throw new Error(`Invalid text search configuration: ${String(config)}`);
  }
  return new Cast(config, 'regconfig');
};

const withConfig = (name: string, text: unknown, config: string | undefined): Fn =>
  new Fn(name, config === undefined ? [text] : [regconfig(config), text]);

const weightsOf = (weights: readonly number[]): Cast => {
  if (weights.length !== 4 || !weights.every((weight) => Number.isFinite(weight))) {
    throw new Error('weights must be four finite numbers');
  }
  return new Cast([...weights], 'real[]');
};

const normalizationOf = (value: number): Cast => {
  if (!Number.isInteger(value) || value < 0 || value > MAX_NORMALIZATION) {
    throw new Error('normalization must be an integer from 0 to 63');
  }
  return new Cast(value, 'integer');
};

/**
 * `to_tsvector([config,] document)`: parses a document into a `tsvector`. PostgreSQL extension.
 *
 * @postgrelize
 * @param document - Text value (bound as a parameter) or an expression such as `col('body')`.
 * @param config - Text search configuration; the server default when omitted.
 * @returns Function call expression.
 * @throws Error when `config` is not a plain or schema-qualified identifier.
 * @example
 * ```ts
 * await Post.findAll({ where: where(toTsVector(col('body'), 'english'), Op.match, websearchToTsQuery('cat -dog', 'english')) });
 * ```
 */
export const toTsVector = (document: unknown, config?: string): Fn =>
  withConfig('to_tsvector', document, config);

/**
 * `to_tsquery([config,] query)`: parses `tsquery` syntax (`&`, `|`, `!`, `<->`). PostgreSQL extension.
 *
 * @postgrelize
 * @param query - Query text in `tsquery` syntax, bound as a parameter. Invalid syntax is a database error.
 * @param config - Text search configuration; the server default when omitted.
 * @returns Function call expression.
 * @throws Error when `config` is not a plain or schema-qualified identifier.
 * @example
 * ```ts
 * await Post.findAll({ where: { search: { [Op.match]: toTsQuery('cat & !dog', 'english') } } });
 * ```
 */
export const toTsQuery = (query: unknown, config?: string): Fn =>
  withConfig('to_tsquery', query, config);

/**
 * `plainto_tsquery([config,] text)`: ANDs all words of plain text. PostgreSQL extension.
 *
 * @postgrelize
 * @param text - Plain text, bound as a parameter.
 * @param config - Text search configuration; the server default when omitted.
 * @returns Function call expression.
 * @throws Error when `config` is not a plain or schema-qualified identifier.
 * @example
 * ```ts
 * await Post.findAll({ where: { search: { [Op.match]: plainToTsQuery('fat cats', 'english') } } });
 * ```
 */
export const plainToTsQuery = (text: unknown, config?: string): Fn =>
  withConfig('plainto_tsquery', text, config);

/**
 * `phraseto_tsquery([config,] text)`: words of plain text that must follow each other. PostgreSQL extension.
 *
 * @postgrelize
 * @param text - Plain text, bound as a parameter.
 * @param config - Text search configuration; the server default when omitted.
 * @returns Function call expression.
 * @throws Error when `config` is not a plain or schema-qualified identifier.
 * @example
 * ```ts
 * await Post.findAll({ where: { search: { [Op.match]: phraseToTsQuery('fat cats', 'english') } } });
 * ```
 */
export const phraseToTsQuery = (text: unknown, config?: string): Fn =>
  withConfig('phraseto_tsquery', text, config);

/**
 * `websearch_to_tsquery([config,] text)`: web-search syntax (quotes, `or`, `-`) that never fails to parse. PostgreSQL extension.
 *
 * @postgrelize
 * @param text - User search text, bound as a parameter.
 * @param config - Text search configuration; the server default when omitted.
 * @returns Function call expression.
 * @throws Error when `config` is not a plain or schema-qualified identifier.
 * @example
 * ```ts
 * await Post.findAll({ where: { search: { [Op.match]: websearchToTsQuery('"fat cat" -dog', 'english') } } });
 * ```
 */
export const websearchToTsQuery = (text: unknown, config?: string): Fn =>
  withConfig('websearch_to_tsquery', text, config);

/**
 * `ts_rank` / `ts_rank_cd`: relevance of a `tsvector` for a `tsquery`, for `attributes` and `order`. PostgreSQL extension.
 *
 * @postgrelize
 * @param vector - `tsvector` expression, e.g. `col('search')`.
 * @param query - `tsquery` expression, e.g. {@link websearchToTsQuery}.
 * @param options - `cd`, `weights` and `normalization`.
 * @returns Function call expression.
 * @throws Error when `weights` is not four finite numbers or `normalization` is not an integer from 0 to 63.
 * @example
 * ```ts
 * const query = websearchToTsQuery('cat', 'english');
 * await Post.findAll({ where: { search: { [Op.match]: query } }, order: [[tsRank(col('search'), query, { normalization: 1 }), 'DESC']] });
 * ```
 */
export const tsRank = (vector: unknown, query: unknown, options: TsRankOptions = {}): Fn => {
  const weights = options.weights === undefined ? [] : [weightsOf(options.weights)];
  const normalization =
    options.normalization === undefined ? [] : [normalizationOf(options.normalization)];
  return new Fn(options.cd === true ? 'ts_rank_cd' : 'ts_rank', [
    ...weights,
    vector,
    query,
    ...normalization,
  ]);
};

/**
 * `ts_headline`: a document excerpt with the query terms highlighted. PostgreSQL extension.
 *
 * @postgrelize
 * @param document - Text expression or value, bound as a parameter.
 * @param query - `tsquery` expression.
 * @param options - Configuration and `ts_headline` options string.
 * @returns Function call expression.
 * @throws Error when `config` is not a plain or schema-qualified identifier.
 * @example
 * ```ts
 * await Post.findAll({ attributes: [[tsHeadline(col('body'), websearchToTsQuery('cat'), { options: 'StartSel=<b>, StopSel=</b>' }), 'excerpt']] });
 * ```
 */
export const tsHeadline = (
  document: unknown,
  query: unknown,
  options: TsHeadlineOptions = {},
): Fn =>
  new Fn('ts_headline', [
    ...(options.config === undefined ? [] : [regconfig(options.config)]),
    document,
    query,
    ...(options.options === undefined ? [] : [new Cast(options.options, 'text')]),
  ]);

/**
 * `setweight(vector, weight)`: labels every lexeme of a `tsvector` `A`, `B`, `C` or `D`. PostgreSQL extension.
 *
 * @postgrelize
 * @param vector - `tsvector` expression, e.g. {@link toTsVector}.
 * @param weight - Label `'A'`, `'B'`, `'C'` or `'D'`.
 * @returns Function call expression.
 * @throws Error when `weight` is not one of the four labels.
 * @example
 * ```ts
 * await Post.findAll({ attributes: [[setWeight(toTsVector(col('title'), 'english'), 'A'), 'titleVector']] });
 * ```
 */
export const setWeight = (vector: unknown, weight: 'A' | 'B' | 'C' | 'D'): Fn => {
  if (!WEIGHTS.has(weight)) {
    throw new Error(`Invalid text search weight: ${String(weight)}`);
  }
  return new Fn('setweight', [vector, new Literal(`'${weight}'`)]);
};
