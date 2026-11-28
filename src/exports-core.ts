import { validator } from './validation/validator.ts';
import { DataTypes } from './data-types/data-types.ts';

/** The `validator` (validator.js) library used by the built-in validators, e.g. `Validator.isEmail(value)` (Sequelize v6 `Validator`). */
export const Validator = validator;
export { DataTypes };
/** Alias of `DataTypes.ABSTRACT` (Sequelize v6 module export). */
export const ABSTRACT = DataTypes.ABSTRACT;
/** Alias of `DataTypes.ARRAY` (Sequelize v6 module export). */
export const ARRAY = DataTypes.ARRAY;
/** Alias of `DataTypes.BIGINT` (Sequelize v6 module export). */
export const BIGINT = DataTypes.BIGINT;
/** Alias of `DataTypes.BLOB` (Sequelize v6 module export). */
export const BLOB = DataTypes.BLOB;
/** Alias of `DataTypes.BOOLEAN` (Sequelize v6 module export). */
export const BOOLEAN = DataTypes.BOOLEAN;
/** Alias of `DataTypes.CHAR` (Sequelize v6 module export). */
export const CHAR = DataTypes.CHAR;
/** Alias of `DataTypes.CIDR` (Sequelize v6 module export). */
export const CIDR = DataTypes.CIDR;
/** Alias of `DataTypes.CITEXT` (Sequelize v6 module export). */
export const CITEXT = DataTypes.CITEXT;
/** Alias of `DataTypes.DATE` (Sequelize v6 module export). */
export const DATE = DataTypes.DATE;
/** Alias of `DataTypes.DATEONLY` (Sequelize v6 module export). */
export const DATEONLY = DataTypes.DATEONLY;
/** Alias of `DataTypes.DECIMAL` (Sequelize v6 module export). */
export const DECIMAL = DataTypes.DECIMAL;
/** Alias of `DataTypes.DOUBLE` (Sequelize v6 module export). */
export const DOUBLE = DataTypes.DOUBLE;
/** Alias of `DataTypes.ENUM` (Sequelize v6 module export). */
export const ENUM = DataTypes.ENUM;
/** Alias of `DataTypes.FLOAT` (Sequelize v6 module export). */
export const FLOAT = DataTypes.FLOAT;
/** Alias of `DataTypes.GEOGRAPHY` (Sequelize v6 module export). */
export const GEOGRAPHY = DataTypes.GEOGRAPHY;
/** Alias of `DataTypes.GEOMETRY` (Sequelize v6 module export). */
export const GEOMETRY = DataTypes.GEOMETRY;
/** Alias of `DataTypes.HSTORE` (Sequelize v6 module export). */
export const HSTORE = DataTypes.HSTORE;
/** Alias of `DataTypes.INET` (Sequelize v6 module export). */
export const INET = DataTypes.INET;
/** Alias of `DataTypes.INTEGER` (Sequelize v6 module export). */
export const INTEGER = DataTypes.INTEGER;
/** Alias of `DataTypes.JSON` (Sequelize v6 module export). */
export const JSON = DataTypes.JSON;
/** Alias of `DataTypes.JSONB` (Sequelize v6 module export). */
export const JSONB = DataTypes.JSONB;
/** Alias of `DataTypes.MACADDR` (Sequelize v6 module export). */
export const MACADDR = DataTypes.MACADDR;
/** Alias of `DataTypes.MEDIUMINT` (Sequelize v6 module export). */
export const MEDIUMINT = DataTypes.MEDIUMINT;
/** Alias of `DataTypes.NOW` (Sequelize v6 module export). */
export const NOW = DataTypes.NOW;
/** Alias of `DataTypes.NUMBER` (Sequelize v6 module export). */
export const NUMBER = DataTypes.NUMBER;
/** Alias of `DataTypes.NUMERIC` (Sequelize v6 module export). */
export const NUMERIC = DataTypes.NUMERIC;
/** Alias of `DataTypes.RANGE` (Sequelize v6 module export). */
export const RANGE = DataTypes.RANGE;
/** Alias of `DataTypes.REAL` (Sequelize v6 module export). */
export const REAL = DataTypes.REAL;
/** Alias of `DataTypes.SMALLINT` (Sequelize v6 module export). */
export const SMALLINT = DataTypes.SMALLINT;
/** Alias of `DataTypes.STRING` (Sequelize v6 module export). */
export const STRING = DataTypes.STRING;
/** Alias of `DataTypes.TEXT` (Sequelize v6 module export). */
export const TEXT = DataTypes.TEXT;
/** Alias of `DataTypes.TIME` (Sequelize v6 module export). */
export const TIME = DataTypes.TIME;
/** Alias of `DataTypes.TINYINT` (Sequelize v6 module export). */
export const TINYINT = DataTypes.TINYINT;
/** Alias of `DataTypes.TSVECTOR` (Sequelize v6 module export). */
export const TSVECTOR = DataTypes.TSVECTOR;
/** Alias of `DataTypes.UUID` (Sequelize v6 module export). */
export const UUID = DataTypes.UUID;
/** Alias of `DataTypes.UUIDV1` (Sequelize v6 module export). */
export const UUIDV1 = DataTypes.UUIDV1;
/** Alias of `DataTypes.UUIDV4` (Sequelize v6 module export). */
export const UUIDV4 = DataTypes.UUIDV4;
/** Alias of `DataTypes.VIRTUAL` (Sequelize v6 module export). */
export const VIRTUAL = DataTypes.VIRTUAL;
export type {
  CompositeValue,
  DataType,
  DataTypeInput,
  DefaultValueGenerator,
  GeoCircle,
  GeoLine,
  GeoPath,
  GeoPoint,
  IntegerDataType,
  RangeBound,
} from './data-types/data-types.ts';
export { Op } from './expressions/op.ts';
export { and, or } from './expressions/logic.ts';
export { useInflection } from './model/inflector.ts';
export type { Inflection } from './model/inflector.ts';
export type { OpSymbol } from './expressions/op.ts';
export { jsonbPath } from './expressions/jsonpath-helpers.ts';
export type { JsonbPathKind, JsonbPathOptions } from './expressions/jsonpath-helpers.ts';
export {
  plainToTsQuery,
  phraseToTsQuery,
  setWeight,
  toTsQuery,
  toTsVector,
  tsHeadline,
  tsRank,
  websearchToTsQuery,
} from './expressions/search-helpers.ts';
export type { TsHeadlineOptions, TsRankOptions } from './expressions/search-helpers.ts';
export {
  trigramDistance,
  trigramSimilarity,
  trigramWordSimilarity,
} from './expressions/trigram-helpers.ts';
export {
  cast,
  col,
  excluded,
  exists,
  fn,
  json,
  literal,
  notExists,
  over,
  tuple,
  where,
} from './expressions/methods.ts';
export type {
  Cast,
  Col,
  Excluded,
  Exists,
  Fn,
  Json,
  Literal,
  Over,
  SqlExpression,
  SetOperationOptions,
  Subquery,
  WriteStatement,
  Tuple,
  Where,
  WhereFactory,
  WindowOptions,
} from './expressions/methods.ts';
export {
  Transaction,
  ISOLATION_LEVELS,
  LOCK,
  TRANSACTION_TYPES,
} from './transaction/transaction.ts';
export type {
  AdvisoryLockKey,
  IsolationLevel,
  LockStrength,
  TransactionOptions,
} from './transaction/transaction.ts';
export type {
  Connection,
  ConnectionManagerContract,
  ConnectionPool,
  GetConnectionOptions,
  PoolCounters,
} from './connection/connection-types.ts';
export type { RetryMatch, RetryOptions } from './connection/retry.ts';
export type {
  ConnectionConfig,
  LoggingFunction,
  ModelDefaults,
  PoolOptions,
  StatementCacheOptions,
  ReplicationMember,
  ReplicationOptions,
  SequelizeOptions,
} from './connection/options.ts';
export type { Replacements, BindParameters } from './query/raw-query.ts';
export { Utils } from './utils-namespace.ts';
