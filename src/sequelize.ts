import * as errorClasses from './errors/errors.ts';
import { Association } from './associations/association.ts';
import { BelongsTo } from './associations/belongs-to.ts';
import { BelongsToMany } from './associations/belongs-to-many.ts';
import { HasMany } from './associations/has-many.ts';
import { HasOne } from './associations/has-one.ts';
import { Deferrable } from './ddl/ddl-generator.ts';
import { and, or } from './expressions/logic.ts';
import { useInflection } from './model/inflector.ts';
import { PackageVersion } from './package-version.ts';
import { QueryInterface } from './query-interface/query-interface.ts';
import { validator } from './validation/validator.ts';
import { DataTypes } from './data-types/data-types.ts';
import { cast, col, fn, json, literal, where } from './expressions/methods.ts';
import { Op } from './expressions/op.ts';
import { Model } from './model/model.ts';
import type { RuntimeOwner } from './model/runtime.ts';
import { QueryTypes } from './query/query-result-shaper.ts';
import { SequelizeBase } from './sequelize/sequelize-base.ts';
import type { InstanceHookAdders } from './sequelize/instance-hook-adders.ts';
import { SequelizeStaticHooks } from './sequelize/sequelize-static-hooks.ts';
import { SequelizeHooks } from './sequelize/sequelize-hooks.ts';
import { SequelizeNotifications } from './sequelize/sequelize-notifications.ts';
import { SequelizeHelpers } from './sequelize/sequelize-helpers.ts';
import { SequelizeSchema } from './sequelize/sequelize-schema.ts';
import { SequelizeTransactions } from './sequelize/sequelize-transactions.ts';
import type { SequelizeOptions } from './connection/options.ts';
import { Transaction } from './transaction/transaction.ts';
import { Utils } from './utils-namespace.ts';
import { transactionScope } from './transaction/transaction-runner.ts';

export { QueryTypes } from './query/query-result-shaper.ts';
export type {
  QueryOptions,
  QueryOptionsWithModel,
  QueryOptionsWithType,
  QueryType,
  TypedQueryResults,
} from './query/query-result-shaper.ts';
export type { DefineOptions } from './sequelize/sequelize-base.ts';
/**
 * Options of the `Sequelize` constructor (Sequelize v6 `Options`); same as {@link SequelizeOptions}.
 *
 * @example
 * ```ts
 * const options: Options = { dialect: 'postgres', logging: false };
 * const sequelize = new Sequelize('postgres://localhost/app', options);
 * ```
 */
export type Options = SequelizeOptions;

const packageVersion = new PackageVersion();

const SequelizeMembers = SequelizeNotifications(
  SequelizeTransactions(
    SequelizeSchema(SequelizeHelpers(SequelizeStaticHooks(SequelizeHooks(SequelizeBase)))),
  ),
);

// Declaration files cannot name the symbol key of a class member, so `RuntimeOwner` is merged in as an interface.
// oxlint-disable-next-line typescript/no-unsafe-declaration-merging -- intentional merge.
export interface Sequelize extends RuntimeOwner, InstanceHookAdders {}

/**
 * Entry point, API-compatible with Sequelize v6 `Sequelize` for PostgreSQL.
 *
 * @example
 * ```ts
 * const sequelize = new Sequelize('postgres://user:pass@localhost:5432/app', { logging: false });
 * ```
 */
// oxlint-disable-next-line typescript/no-unsafe-declaration-merging -- see the interface above.
export class Sequelize extends SequelizeMembers {
  /** Column types. */
  static readonly DataTypes = DataTypes;
  /** Query operators. */
  static readonly Op: typeof Op = Op;
  /** Result shapes accepted by the `type` option of {@link Sequelize.query}, e.g. `QueryTypes.SELECT`. */
  static readonly QueryTypes = QueryTypes;
  /** Transaction class. */
  static readonly Transaction = Transaction;
  /** Model base class. */
  static readonly Model = Model;
  /** Raw SQL fragment builder. */
  static readonly literal = literal;
  /** SQL function call builder. */
  static readonly fn = fn;
  /** Column reference builder. */
  static readonly col = col;
  /** Type cast builder. */
  static readonly cast = cast;
  /** Comparison builder. */
  static readonly where = where;
  /** JSON path builder. */
  static readonly json = json;
  /** Subset of the v6 `Utils` helpers, see {@link Utils}. */
  static readonly Utils = Utils;

  // Sequelize v6 static aliases of the DataTypes and the error classes.
  /** Alias of `DataTypes.ABSTRACT`. */
  static readonly ABSTRACT = DataTypes.ABSTRACT;
  /** Alias of `DataTypes.ARRAY`. */
  static readonly ARRAY = DataTypes.ARRAY;
  /** Alias of `DataTypes.BIGINT`. */
  static readonly BIGINT = DataTypes.BIGINT;
  /** Alias of `DataTypes.BLOB`. */
  static readonly BLOB = DataTypes.BLOB;
  /** Alias of `DataTypes.BOOLEAN`. */
  static readonly BOOLEAN = DataTypes.BOOLEAN;
  /** Alias of `DataTypes.CHAR`. */
  static readonly CHAR = DataTypes.CHAR;
  /** Alias of `DataTypes.CIDR`. */
  static readonly CIDR = DataTypes.CIDR;
  /** Alias of `DataTypes.CITEXT`. */
  static readonly CITEXT = DataTypes.CITEXT;
  /** Alias of `DataTypes.DATE`. */
  static readonly DATE = DataTypes.DATE;
  /** Alias of `DataTypes.DATEONLY`. */
  static readonly DATEONLY = DataTypes.DATEONLY;
  /** Alias of `DataTypes.DECIMAL`. */
  static readonly DECIMAL = DataTypes.DECIMAL;
  /** Alias of `DataTypes.DOUBLE`. */
  static readonly DOUBLE = DataTypes.DOUBLE;
  /** Alias of `DataTypes.ENUM`. */
  static readonly ENUM = DataTypes.ENUM;
  /** Alias of `DataTypes.FLOAT`. */
  static readonly FLOAT = DataTypes.FLOAT;
  /** Alias of `DataTypes.GEOGRAPHY`. */
  static readonly GEOGRAPHY = DataTypes.GEOGRAPHY;
  /** Alias of `DataTypes.GEOMETRY`. */
  static readonly GEOMETRY = DataTypes.GEOMETRY;
  /** Alias of `DataTypes.HSTORE`. */
  static readonly HSTORE = DataTypes.HSTORE;
  /** Alias of `DataTypes.INET`. */
  static readonly INET = DataTypes.INET;
  /** Alias of `DataTypes.INTEGER`. */
  static readonly INTEGER = DataTypes.INTEGER;
  /** Alias of `DataTypes.JSON`. */
  static readonly JSON = DataTypes.JSON;
  /** Alias of `DataTypes.JSONB`. */
  static readonly JSONB = DataTypes.JSONB;
  /** Alias of `DataTypes.MACADDR`. */
  static readonly MACADDR = DataTypes.MACADDR;
  /** Alias of `DataTypes.MEDIUMINT`. */
  static readonly MEDIUMINT = DataTypes.MEDIUMINT;
  /** Alias of `DataTypes.NOW`. */
  static readonly NOW = DataTypes.NOW;
  /** Alias of `DataTypes.NUMBER`. */
  static readonly NUMBER = DataTypes.NUMBER;
  /** Alias of `DataTypes.NUMERIC`. */
  static readonly NUMERIC = DataTypes.NUMERIC;
  /** Alias of `DataTypes.RANGE`. */
  static readonly RANGE = DataTypes.RANGE;
  /** Alias of `DataTypes.REAL`. */
  static readonly REAL = DataTypes.REAL;
  /** Alias of `DataTypes.SMALLINT`. */
  static readonly SMALLINT = DataTypes.SMALLINT;
  /** Alias of `DataTypes.STRING`. */
  static readonly STRING = DataTypes.STRING;
  /** Alias of `DataTypes.TEXT`. */
  static readonly TEXT = DataTypes.TEXT;
  /** Alias of `DataTypes.TIME`. */
  static readonly TIME = DataTypes.TIME;
  /** Alias of `DataTypes.TINYINT`. */
  static readonly TINYINT = DataTypes.TINYINT;
  /** Alias of `DataTypes.TSVECTOR`. */
  static readonly TSVECTOR = DataTypes.TSVECTOR;
  /** Alias of `DataTypes.UUID`. */
  static readonly UUID = DataTypes.UUID;
  /** Alias of `DataTypes.UUIDV1`. */
  static readonly UUIDV1 = DataTypes.UUIDV1;
  /** Alias of `DataTypes.UUIDV4`. */
  static readonly UUIDV4 = DataTypes.UUIDV4;
  /** Alias of `DataTypes.VIRTUAL`. */
  static readonly VIRTUAL = DataTypes.VIRTUAL;
  /** Alias of `DataTypes.DOUBLE`. */
  static readonly 'DOUBLE PRECISION' = DataTypes['DOUBLE PRECISION'];
  /** Alias of the exported `AccessDeniedError`. */
  static readonly AccessDeniedError = errorClasses.AccessDeniedError;
  /** Alias of the exported `AggregateError`. */
  static readonly AggregateError = errorClasses.AggregateError;
  /** Alias of the exported `AssociationError`. */
  static readonly AssociationError = errorClasses.AssociationError;
  /** Alias of the exported `BaseError`. */
  static readonly BaseError = errorClasses.BaseError;
  /** Alias of the exported `BulkRecordError`. */
  static readonly BulkRecordError = errorClasses.BulkRecordError;
  /** Alias of the exported `ConnectionAcquireTimeoutError`. */
  static readonly ConnectionAcquireTimeoutError = errorClasses.ConnectionAcquireTimeoutError;
  /** Alias of the exported `ConnectionError`. */
  static readonly ConnectionError = errorClasses.ConnectionError;
  /** Alias of the exported `ConnectionRefusedError`. */
  static readonly ConnectionRefusedError = errorClasses.ConnectionRefusedError;
  /** Alias of the exported `ConnectionTimedOutError`. */
  static readonly ConnectionTimedOutError = errorClasses.ConnectionTimedOutError;
  /** Alias of the exported `DatabaseError`. */
  static readonly DatabaseError = errorClasses.DatabaseError;
  /** Alias of the exported `EagerLoadingError`. */
  static readonly EagerLoadingError = errorClasses.EagerLoadingError;
  /** Alias of the exported `EmptyResultError`. */
  static readonly EmptyResultError = errorClasses.EmptyResultError;
  /** Alias of the exported `ExclusionConstraintError`. */
  static readonly ExclusionConstraintError = errorClasses.ExclusionConstraintError;
  /** Alias of the exported `ForeignKeyConstraintError`. */
  static readonly ForeignKeyConstraintError = errorClasses.ForeignKeyConstraintError;
  /** Alias of the exported `HostNotFoundError`. */
  static readonly HostNotFoundError = errorClasses.HostNotFoundError;
  /** Alias of the exported `HostNotReachableError`. */
  static readonly HostNotReachableError = errorClasses.HostNotReachableError;
  /** Alias of the exported `InstanceError`. */
  static readonly InstanceError = errorClasses.InstanceError;
  /** Alias of the exported `InvalidConnectionError`. */
  static readonly InvalidConnectionError = errorClasses.InvalidConnectionError;
  /** Alias of the exported `OptimisticLockError`. */
  static readonly OptimisticLockError = errorClasses.OptimisticLockError;
  /** Alias of the exported `QueryError`. */
  static readonly QueryError = errorClasses.QueryError;
  /** Alias of the exported `SequelizeScopeError`. */
  static readonly SequelizeScopeError = errorClasses.SequelizeScopeError;
  /** Alias of the exported `TimeoutError`. */
  static readonly TimeoutError = errorClasses.TimeoutError;
  /** Alias of the exported `UniqueConstraintError`. */
  static readonly UniqueConstraintError = errorClasses.UniqueConstraintError;
  /** Alias of the exported `UnknownConstraintError`. */
  static readonly UnknownConstraintError = errorClasses.UnknownConstraintError;
  /** Alias of the exported `ValidationError`. */
  static readonly ValidationError = errorClasses.ValidationError;
  /** Alias of the exported `ValidationErrorItem`. */
  static readonly ValidationErrorItem = errorClasses.ValidationErrorItem;
  /** Alias of the exported `ValidationErrorItemOrigin`. */
  static readonly ValidationErrorItemOrigin = errorClasses.ValidationErrorItemOrigin;
  /** Alias of the exported `ValidationErrorItemType`. */
  static readonly ValidationErrorItemType = errorClasses.ValidationErrorItemType;
  /** Alias of `BaseError`. */
  static readonly Error = errorClasses.BaseError;
  /** `Deferrable` constraint modes. */
  static readonly Deferrable = Deferrable;
  /** Base class of the association classes. */
  static readonly Association = Association;
  /** `hasOne` association class. */
  static readonly HasOne = HasOne;
  /** `hasMany` association class. */
  static readonly HasMany = HasMany;
  /** `belongsTo` association class. */
  static readonly BelongsTo = BelongsTo;
  /** `belongsToMany` association class. */
  static readonly BelongsToMany = BelongsToMany;
  /** Schema API class. */
  static readonly QueryInterface = QueryInterface;
  /** The `validator` library used by the built-in validators. */
  static readonly Validator = validator;
  /** Combines conditions with `AND`. */
  static readonly and = and;
  /** Combines conditions with `OR`. */
  static readonly or = or;
  /** Replaces the inflection library, see {@link useInflection}. */
  static readonly useInflection = useInflection;

  /**
   * Version of the installed postgrelize package (Sequelize v6 `Sequelize.version` reports its own version).
   *
   * @returns Semver string, e.g. `'1.1.0'`.
   */
  static get version(): string {
    return packageVersion.read();
  }

  /**
   * Enables continuation-local transactions: queries inside `sequelize.transaction(fn)` use the
   * transaction automatically. Without an argument `AsyncLocalStorage` is used. With a `cls-hooked`
   * style namespace (an object with `bind`, `run`, `get` and `set`) it behaves as in Sequelize v6:
   * managed transactions run in `namespace.run` and store themselves under `namespace.get('transaction')`
   * (cleared when they finish), queries without a `transaction` option read the key, and a nested
   * `sequelize.transaction(callback)` opens its own transaction instead of a savepoint.
   *
   * @param namespace - CLS namespace; `AsyncLocalStorage` when omitted.
   * @returns The `Sequelize` class.
   * @throws Error `Must provide CLS namespace` when `namespace` has no `bind` or `run`.
   * @see {@link Sequelize.transaction}
   *
   * @example
   * ```ts
   * Sequelize.useCLS();
   * await sequelize.transaction(async () => {
   *   // No `{ transaction }` option needed: the queries join the managed transaction.
   *   const user = await User.create({ name: 'Ada' });
   *   await Post.create({ title: 'Hello', userId: user.id });
   * });
   * ```
   */
  static useCLS(namespace?: unknown): typeof Sequelize {
    transactionScope.enableCls(namespace);
    return Sequelize;
  }

  /**
   * Creates an instance from a connection URI.
   *
   * @param uri - `postgres://user:password@host:port/database`.
   * @param options - Options.
   */
  constructor(uri: string, options?: SequelizeOptions);
  /**
   * Creates an instance from connection parameters.
   *
   * @param database - Database name.
   * @param username - User name.
   * @param password - Password.
   * @param options - Options.
   */
  constructor(
    database: string,
    username?: string | null,
    password?: string | null,
    options?: SequelizeOptions,
  );
  /**
   * Creates an instance from options only.
   *
   * @param options - Options including connection settings.
   */
  constructor(options?: SequelizeOptions);
  // oxlint-disable-next-line no-useless-constructor -- re-declares the typed overloads that mixin construction would erase.
  constructor(...args: readonly unknown[]) {
    super(...args);
  }

  /** The `Sequelize` class (Sequelize v6 `sequelize.Sequelize`). */
  get Sequelize(): typeof Sequelize {
    return Sequelize;
  }
}
